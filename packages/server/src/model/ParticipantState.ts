import {
  PlayerId,
  Team,
  Champion,
  Position,
  ConnectionStatus,
  Ability,
  ParticipantSnapshot,
  ActorIncapacitatedError,
  AbilityOnCooldownError,
  InsufficientResourceError,
} from '@arena/shared';

/**
 * A single player's live combat state within one match — position, health, resource, cooldowns, and
 * connection status. Not an AbstractModel; observed indirectly through its owning MatchModel
 * (docs/01_class_list.md §5a).
 */
export class ParticipantState {
  /** The champion this participant selected, or null before Champion Select completes. */
  public champion: Champion | null = null;
  /** Current authoritative arena position; server-computed, never trusts client input directly (2.1, R4.1). */
  public position: Position;
  /** Current health; 0 or below means eliminated (checked via isAlive()). */
  public health = 0;
  /** Current ability resource (mana/energy-equivalent). */
  public resource = 0;
  /** Ability id → the simulation timestamp (ms) at which its cooldown next elapses. */
  private cooldowns: Map<string, number> = new Map();
  /** Simulation timestamp (ms) until which this participant is crowd-controlled; 0 or past means none active. */
  private crowdControlledUntil = 0;
  /** Whether this participant's socket is currently connected (R6.1–R6.4). */
  public connectionStatus: ConnectionStatus = ConnectionStatus.CONNECTED;
  /** Simulation timestamp (ms) of the most recent disconnect, or null if currently connected (R6.4 grace-period start). */
  public disconnectedAt: number | null = null;

  constructor(
    /** The player this state belongs to. */
    public readonly playerId: PlayerId,
    /** Which side (A/B) this participant is on for win-condition and pairing purposes. */
    public readonly team: Team,
  ) {
    this.position = new Position(0, 0);
  }

  /**
   * Applies incoming ability/effect damage to this participant's health, clamped at zero.
   * @param amount - damage to subtract from health; must be non-negative
   */
  applyDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  /**
   * Applies incoming healing to this participant's health, clamped at the champion's max health.
   * @param amount - health to restore; must be non-negative
   */
  applyHeal(amount: number): void {
    const max = this.champion?.maxHealth ?? this.health + amount;
    this.health = Math.min(max, this.health + amount);
  }

  /**
   * Extends this participant's crowd-control window, preventing movement and ability use until it elapses.
   * A shorter, newly-applied CC never shortens an existing longer one — the window only extends.
   *
   * CORRECTION (Step 9): added the `now` parameter — without it there is no way to compute an absolute
   * expiry timestamp, and every other time-sensitive method on this class (`useAbility`, `canUseAbility`,
   * `move`, `toSnapshot`) already takes `now` for the same reason. `docs/01_class_list.md` §5a is updated
   * to match.
   * @param durationMs - how long, from now, the participant remains crowd-controlled
   * @param now - current simulation time
   */
  applyCrowdControl(durationMs: number, now: number): void {
    this.crowdControlledUntil = Math.max(this.crowdControlledUntil, now + durationMs);
  }

  /**
   * Regenerates resource for the elapsed tick, clamped at the champion's max resource. A no-op before a
   * champion has been selected.
   * MANDATORY: called every tick by MatchModel.tick() — see prompts/00_master_context.md §8.
   * @param deltaSeconds - elapsed simulation time since the previous tick
   */
  regenerateResource(deltaSeconds: number): void {
    if (!this.champion) return;
    const max = this.champion.maxResource;
    this.resource = Math.min(max, this.resource + this.champion.resourceRegenRate * deltaSeconds);
  }

  private isIncapacitated(now: number): boolean {
    return !this.isAlive() || this.crowdControlledUntil > now;
  }

  /**
   * Reports whether the given ability could currently be used, without applying any effect or throwing —
   * a non-throwing precheck for callers (e.g. the client) that want to reflect availability in the UI.
   * Returns false (not an error) if no champion is selected yet or abilityId doesn't belong to it.
   * @param abilityId - the ability to check
   * @param now - current simulation time, for cooldown comparison
   * @returns true if cooldown has elapsed, resource is sufficient, and the participant is not incapacitated
   */
  canUseAbility(abilityId: string, now: number): boolean {
    if (!this.champion) return false;
    const ability = this.champion.abilities.find((a) => a.id === abilityId);
    if (!ability) return false;
    if (this.isIncapacitated(now)) return false;
    const readyAt = this.cooldowns.get(ability.id) ?? 0;
    if (readyAt > now) return false;
    if (this.resource < ability.resourceCost) return false;
    return true;
  }

  /**
   * Validates and applies an ability use: cooldown, resource cost, and incapacitation are all checked
   * before any effect is applied (R4.2). Does not itself validate target range — MatchModel.submitAbility
   * resolves range before delegating here, since this method has no target-position parameter to check
   * against (see docs/01_class_list.md §5a). Does not itself apply the ability's damage/heal/CC effect —
   * that is MatchModel's job, applied to whichever ParticipantState(s) the ability targets, using
   * `ability.effectType`/`ability.magnitude`; this method only validates and consumes the caster's cost.
   * Validation order: incapacitation, then cooldown, then resource — incapacitation is checked first
   * because it is the most fundamental gate (a dead or crowd-controlled caster can't act regardless of
   * whether the ability itself would otherwise be ready).
   * @param ability - the ability being used
   * @param now - current simulation time, for cooldown comparison
   * @throws {ActorIncapacitatedError} if this participant is dead or crowd-controlled
   * @throws {AbilityOnCooldownError} if the ability's cooldown has not elapsed
   * @throws {InsufficientResourceError} if resource is below the ability's cost
   */
  useAbility(ability: Ability, now: number): void {
    if (this.isIncapacitated(now)) {
      throw new ActorIncapacitatedError(this.playerId, this.isAlive() ? 'crowd-controlled' : 'dead');
    }
    const readyAt = this.cooldowns.get(ability.id) ?? 0;
    if (readyAt > now) {
      throw new AbilityOnCooldownError(ability.id, (readyAt - now) / 1000);
    }
    if (this.resource < ability.resourceCost) {
      throw new InsufficientResourceError(ability.id, ability.resourceCost, this.resource);
    }
    this.cooldowns.set(ability.id, now + ability.cooldownSeconds * 1000);
    this.resource -= ability.resourceCost;
  }

  /**
   * Validates and applies movement input, scaled by elapsed time and the champion's move speed.
   *
   * CORRECTION (Step 9): added the `now` parameter, for the same reason as `applyCrowdControl` above.
   * @param direction - raw movement input for this tick; scaled by champion move speed, not pre-normalized
   * @param deltaSeconds - elapsed simulation time since the previous tick
   * @param now - current simulation time, for incapacitation comparison
   * @throws {ActorIncapacitatedError} if this participant is dead or crowd-controlled
   */
  move(direction: { dx: number; dy: number }, deltaSeconds: number, now: number): void {
    if (this.isIncapacitated(now)) {
      throw new ActorIncapacitatedError(this.playerId, this.isAlive() ? 'crowd-controlled' : 'dead');
    }
    const speed = this.champion?.moveSpeed ?? 0;
    this.position = new Position(
      this.position.x + direction.dx * speed * deltaSeconds,
      this.position.y + direction.dy * speed * deltaSeconds,
    );
  }

  /** @returns true if health is above zero. */
  isAlive(): boolean {
    return this.health > 0;
  }

  /**
   * @returns a read-only snapshot of this participant's state, suitable for broadcast to clients.
   *
   * CORRECTION (Step 9): added the `now` parameter — `cooldownsRemaining` and `crowdControlled` are both
   * relative-to-now values that cannot be computed from stored absolute timestamps without it.
   * PRECONDITION: only call once a champion has been selected (`this.champion` is non-null) — MatchModel
   * only snapshots participants once the match has left CHAMPION_SELECT phase.
   * @param now - current simulation time
   */
  toSnapshot(now: number): ParticipantSnapshot {
    const cooldownsRemaining: Record<string, number> = {};
    for (const [abilityId, readyAt] of this.cooldowns) {
      const remaining = Math.max(0, (readyAt - now) / 1000);
      if (remaining > 0) cooldownsRemaining[abilityId] = remaining;
    }
    return {
      playerId: this.playerId,
      team: this.team,
      championId: this.champion!.id,
      position: this.position,
      health: this.health,
      resource: this.resource,
      cooldownsRemaining,
      crowdControlled: this.crowdControlledUntil > now,
      connectionStatus: this.connectionStatus,
      alive: this.isAlive(),
    };
  }
}
