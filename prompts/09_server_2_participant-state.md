# Prompt 09_server_2 — ParticipantState Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL: two signature corrections included below
`applyCrowdControl`, `move`, and `toSnapshot` each gain a `now: number` parameter that the current stub
doesn't have — real implementation revealed they need the simulation clock to compute/compare time-based
state, the same way `useAbility`/`canUseAbility` already do. This prompt's diff includes the doc-comment
explaining why, and you must also update `docs/01_class_list.md`'s `ParticipantState` row (§5a) to match —
see step 3 below.

---

### 1. Replace `packages/server/src/model/ParticipantState.ts` with:

```ts
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
```

### 2. Create `packages/server/src/model/ParticipantState.test.ts` with:

```ts
import {
  Team,
  Champion,
  Ability,
  EffectType,
  ConnectionStatus,
  ActorIncapacitatedError,
  AbilityOnCooldownError,
  InsufficientResourceError,
} from '@arena/shared';
import { ParticipantState } from './ParticipantState';

function makeChampion(): Champion {
  return new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 10, 200, [
    new Ability('bolt', 'Bolt', 5, 20, 500, EffectType.DAMAGE, 30),
    new Ability('cheap', 'Cheap Poke', 0.5, 5, 500, EffectType.DAMAGE, 5),
  ]);
}

function makeParticipant(): ParticipantState {
  const p = new ParticipantState('player-1', Team.A);
  p.champion = makeChampion();
  p.health = 85;
  p.resource = 100;
  return p;
}

describe('ParticipantState', () => {
  describe('constructor', () => {
    it('starts with position (0,0), zero health/resource, no champion, connected', () => {
      const p = new ParticipantState('player-1', Team.A);
      expect(p.playerId).toBe('player-1');
      expect(p.team).toBe(Team.A);
      expect(p.champion).toBeNull();
      expect(p.position.x).toBe(0);
      expect(p.position.y).toBe(0);
      expect(p.health).toBe(0);
      expect(p.resource).toBe(0);
      expect(p.connectionStatus).toBe(ConnectionStatus.CONNECTED);
    });
  });

  describe('applyDamage', () => {
    it('subtracts from health', () => {
      const p = makeParticipant();
      p.applyDamage(30);
      expect(p.health).toBe(55);
    });

    it('clamps at zero on overkill', () => {
      const p = makeParticipant();
      p.applyDamage(1000);
      expect(p.health).toBe(0);
    });
  });

  describe('applyHeal', () => {
    it('adds to health', () => {
      const p = makeParticipant();
      p.health = 50;
      p.applyHeal(20);
      expect(p.health).toBe(70);
    });

    it('clamps at champion max health', () => {
      const p = makeParticipant();
      p.health = 80;
      p.applyHeal(100);
      expect(p.health).toBe(85);
    });
  });

  describe('applyCrowdControl', () => {
    it('sets an expiry relative to now', () => {
      const p = makeParticipant();
      p.applyCrowdControl(2000, 1000);
      expect(p.canUseAbility('bolt', 2999)).toBe(false);
      expect(p.canUseAbility('bolt', 3001)).toBe(true);
    });

    it('never shortens an existing longer window (stacking extends, does not reset)', () => {
      const p = makeParticipant();
      p.applyCrowdControl(5000, 1000); // expires at 6000
      p.applyCrowdControl(1000, 1000); // would expire at 2000 -- must not shorten
      expect(p.canUseAbility('bolt', 3000)).toBe(false); // still CC'd from the first application
    });
  });

  describe('regenerateResource', () => {
    it('adds rate * deltaSeconds, clamped at max', () => {
      const p = makeParticipant();
      p.resource = 90;
      p.regenerateResource(0.5); // rate 10/s * 0.5s = 5
      expect(p.resource).toBe(95);
      p.regenerateResource(10); // would overflow past 100
      expect(p.resource).toBe(100);
    });

    it('is a no-op before champion selection', () => {
      const p = new ParticipantState('player-1', Team.A);
      p.resource = 0;
      p.regenerateResource(5);
      expect(p.resource).toBe(0);
    });
  });

  describe('canUseAbility', () => {
    it('true when ready', () => {
      const p = makeParticipant();
      expect(p.canUseAbility('bolt', 1000)).toBe(true);
    });

    it('false before a champion has been selected', () => {
      const p = new ParticipantState('player-1', Team.A);
      expect(p.canUseAbility('bolt', 1000)).toBe(false);
    });

    it('false for an unknown ability id', () => {
      const p = makeParticipant();
      expect(p.canUseAbility('nonexistent', 1000)).toBe(false);
    });

    it('false when on cooldown', () => {
      const p = makeParticipant();
      p.useAbility(p.champion!.abilities[0], 1000);
      expect(p.canUseAbility('bolt', 1500)).toBe(false);
    });

    it('false when resource is insufficient', () => {
      const p = makeParticipant();
      p.resource = 10;
      expect(p.canUseAbility('bolt', 1000)).toBe(false);
    });

    it('false when dead', () => {
      const p = makeParticipant();
      p.health = 0;
      expect(p.canUseAbility('bolt', 1000)).toBe(false);
    });

    it('false when crowd-controlled', () => {
      const p = makeParticipant();
      p.applyCrowdControl(5000, 1000);
      expect(p.canUseAbility('bolt', 2000)).toBe(false);
    });
  });

  describe('useAbility', () => {
    it("sets cooldown and deducts resource on success (using the caster's own champion instance)", () => {
      const p = makeParticipant();
      const bolt = p.champion!.abilities[0];
      p.useAbility(bolt, 1000);
      expect(p.resource).toBe(80);
      expect(p.canUseAbility('bolt', 1000)).toBe(false);
      expect(p.canUseAbility('bolt', 1000 + 5000)).toBe(true);
    });

    it('throws AbilityOnCooldownError when on cooldown', () => {
      const p = makeParticipant();
      const bolt = makeChampion().abilities[0];
      p.useAbility(bolt, 1000);
      expect(() => p.useAbility(bolt, 1200)).toThrow(AbilityOnCooldownError);
    });

    it('throws InsufficientResourceError when under cost', () => {
      const p = makeParticipant();
      p.resource = 5;
      const bolt = makeChampion().abilities[0];
      expect(() => p.useAbility(bolt, 1000)).toThrow(InsufficientResourceError);
    });

    it('throws ActorIncapacitatedError when dead', () => {
      const p = makeParticipant();
      p.health = 0;
      const bolt = makeChampion().abilities[0];
      expect(() => p.useAbility(bolt, 1000)).toThrow(ActorIncapacitatedError);
    });

    it('throws ActorIncapacitatedError when crowd-controlled', () => {
      const p = makeParticipant();
      p.applyCrowdControl(5000, 1000);
      const bolt = makeChampion().abilities[0];
      expect(() => p.useAbility(bolt, 2000)).toThrow(ActorIncapacitatedError);
    });

    it('checks incapacitation before cooldown/resource (a dead caster reports incapacitated, not on-cooldown)', () => {
      const p = makeParticipant();
      const bolt = p.champion!.abilities[0];
      p.useAbility(bolt, 1000); // now on cooldown
      p.health = 0; // and dead
      expect(() => p.useAbility(bolt, 1200)).toThrow(ActorIncapacitatedError);
    });
  });

  describe('move', () => {
    it('moves position scaled by champion speed and deltaSeconds', () => {
      const p = makeParticipant(); // moveSpeed 200
      p.move({ dx: 1, dy: 0 }, 0.5, 1000); // 200 * 0.5 = 100
      expect(p.position.x).toBe(100);
      expect(p.position.y).toBe(0);
    });

    it('throws ActorIncapacitatedError when dead', () => {
      const p = makeParticipant();
      p.health = 0;
      expect(() => p.move({ dx: 1, dy: 0 }, 0.5, 1000)).toThrow(ActorIncapacitatedError);
    });

    it('throws ActorIncapacitatedError when crowd-controlled', () => {
      const p = makeParticipant();
      p.applyCrowdControl(5000, 1000);
      expect(() => p.move({ dx: 1, dy: 0 }, 0.5, 2000)).toThrow(ActorIncapacitatedError);
    });
  });

  describe('isAlive', () => {
    it('true when health > 0, false at 0', () => {
      const p = makeParticipant();
      expect(p.isAlive()).toBe(true);
      p.health = 0;
      expect(p.isAlive()).toBe(false);
    });
  });

  describe('toSnapshot', () => {
    it('reflects current state', () => {
      const p = makeParticipant();
      const snap = p.toSnapshot(1000);
      expect(snap.playerId).toBe('player-1');
      expect(snap.team).toBe(Team.A);
      expect(snap.championId).toBe('vex');
      expect(snap.health).toBe(85);
      expect(snap.resource).toBe(100);
      expect(snap.cooldownsRemaining).toEqual({});
      expect(snap.crowdControlled).toBe(false);
      expect(snap.alive).toBe(true);
    });

    it('includes remaining cooldown seconds only for abilities actually on cooldown', () => {
      const p = makeParticipant();
      const bolt = p.champion!.abilities[0];
      p.useAbility(bolt, 1000); // ready again at 6000
      const snap = p.toSnapshot(4000);
      expect(snap.cooldownsRemaining.bolt).toBeCloseTo(2, 5);
    });

    it('reports crowdControlled true while the window is active', () => {
      const p = makeParticipant();
      p.applyCrowdControl(3000, 1000);
      expect(p.toSnapshot(2000).crowdControlled).toBe(true);
      expect(p.toSnapshot(4001).crowdControlled).toBe(false);
    });
  });
});
```

### 3. Update `docs/01_class_list.md` §5a (`ParticipantState` row)
Change the `applyCrowdControl`/`move`/`toSnapshot` signatures in the table to include `now: number`, and
add a row-note below the table: "**Step 9 correction**: `applyCrowdControl`, `move`, and `toSnapshot`
gained a `now: number` parameter during implementation — all three need the simulation clock to compute or
compare against time-based state (crowd-control expiry, remaining cooldowns), and `useAbility`/
`canUseAbility` already established that pattern."

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest ParticipantState
--coverage --collectCoverageFrom="src/model/ParticipantState.ts"` — expect all tests passing at ~100%
statement/line/function coverage (validated result: 29 tests, 100/92/100/100). Branch `server` from `main`
(`git branch -D server 2>/dev/null; git checkout -b server main`), commit `Step 9: ParticipantState
implementation and tests`, push, open a PR into `main`.

**MANDATORY prerequisite check**: `npm run typecheck --workspaces` must show no config errors before you
start — if `packages/*/jest.config.js` don't exist yet, stop; that means a prior infra fix hasn't landed,
and none of this batch's tests will run correctly without it (ts-jest must be wired up, or Jest silently
falls back to a plain Babel transform that cannot parse TypeScript at all).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `MatchModel` (the next three prompts) depends on this class's exact final shape — do not
deviate from the signatures above, especially the three corrected ones.**
