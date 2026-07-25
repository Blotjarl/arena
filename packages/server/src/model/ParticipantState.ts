import {
  PlayerId,
  Team,
  Champion,
  Position,
  ConnectionStatus,
  Ability,
  ParticipantSnapshot,
  NotImplementedError,
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
    throw new NotImplementedError('ParticipantState.applyDamage not yet implemented');
  }

  /**
   * Applies incoming healing to this participant's health, clamped at the champion's max health.
   * @param amount - health to restore; must be non-negative
   */
  applyHeal(amount: number): void {
    throw new NotImplementedError('ParticipantState.applyHeal not yet implemented');
  }

  /**
   * Extends this participant's crowd-control window, preventing movement and ability use until it elapses.
   * @param durationMs - how long, from now, the participant remains crowd-controlled
   */
  applyCrowdControl(durationMs: number): void {
    throw new NotImplementedError('ParticipantState.applyCrowdControl not yet implemented');
  }

  /**
   * Regenerates resource for the elapsed tick, clamped at the champion's max resource.
   * MANDATORY: called every tick by MatchModel.tick() — see prompts/00_master_context.md §8.
   * @param deltaSeconds - elapsed simulation time since the previous tick
   */
  regenerateResource(deltaSeconds: number): void {
    throw new NotImplementedError('ParticipantState.regenerateResource not yet implemented');
  }

  /**
   * Reports whether the given ability could currently be used, without applying any effect or throwing —
   * a non-throwing precheck for callers (e.g. the client) that want to reflect availability in the UI.
   * @param abilityId - the ability to check
   * @param now - current simulation time, for cooldown comparison
   * @returns true if cooldown has elapsed, resource is sufficient, and the participant is not incapacitated
   */
  canUseAbility(abilityId: string, now: number): boolean {
    throw new NotImplementedError('ParticipantState.canUseAbility not yet implemented');
  }

  /**
   * Validates and applies an ability use: cooldown, resource cost, and incapacitation are all checked
   * before any effect is applied (R4.2). Does not itself validate target range — MatchModel.submitAbility
   * resolves range before delegating here, since this method has no target-position parameter to check
   * against (see docs/01_class_list.md §5a).
   * @param ability - the ability being used
   * @param now - current simulation time, for cooldown comparison
   * @throws {AbilityOnCooldownError} if the ability's cooldown has not elapsed
   * @throws {InsufficientResourceError} if resource is below the ability's cost
   * @throws {ActorIncapacitatedError} if this participant is dead or crowd-controlled
   */
  useAbility(ability: Ability, now: number): void {
    throw new NotImplementedError('ParticipantState.useAbility not yet implemented');
  }

  /**
   * Validates and applies movement input, scaled by elapsed time and the champion's move speed.
   * @param direction - normalized/raw movement input for this tick
   * @param deltaSeconds - elapsed simulation time since the previous tick
   * @throws {ActorIncapacitatedError} if this participant is dead or crowd-controlled
   */
  move(direction: { dx: number; dy: number }, deltaSeconds: number): void {
    throw new NotImplementedError('ParticipantState.move not yet implemented');
  }

  /** @returns true if health is above zero. */
  isAlive(): boolean {
    throw new NotImplementedError('ParticipantState.isAlive not yet implemented');
  }

  /** @returns a read-only snapshot of this participant's state, suitable for broadcast to clients. */
  toSnapshot(): ParticipantSnapshot {
    throw new NotImplementedError('ParticipantState.toSnapshot not yet implemented');
  }
}
