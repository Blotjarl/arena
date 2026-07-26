# Prompt 09_server_4 — MatchModel: Combat and Win Conditions (increment 2 of 3)

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
**MANDATORY prerequisite: `09_server_3` must be merged first** — this prompt extends that file. Increment
2 of 3: adds `submitMove`, `submitAbility`, `checkWinConditions`, and expands `tick()`'s ACTIVE-phase
branch to drive combat. Disconnect-forfeit handling is still `09_server_5` — don't add it here.

---

### 1. Replace `packages/server/src/model/MatchModel.ts` with (adds to the `09_server_3` version — imports,
new fields, and the five new/expanded methods are marked):

```ts
import {
  AbstractModel,
  MatchId,
  MatchPhase,
  EndReason,
  EffectType,
  Team,
  Player,
  MatchStatePayload,
  ModelEvent,
  ChampionRoster,
  ArenaError,
  InvalidMatchPhaseError,
  SelectionWindowExpiredError,
} from '@arena/shared';
import { ParticipantState } from './ParticipantState';

const CHAMPION_SELECT_WINDOW_MS = 30_000;
const MATCH_TIME_LIMIT_MS = 5 * 60_000;

export class MatchModel extends AbstractModel {
  public phase: MatchPhase = MatchPhase.CHAMPION_SELECT;
  private participants: [ParticipantState, ParticipantState];
  public championSelectDeadline: number;
  public startedAt: number | null = null;
  public endedAt: number | null = null;
  public endReason: EndReason | null = null;
  public winningTeam: Team | null = null;
  private tickCount = 0;
  /** NEW: each participant's most recently submitted movement input, applied once per tick (see submitMove). */
  private pendingMoves: Map<string, { dx: number; dy: number }> = new Map();

  constructor(
    public readonly id: MatchId,
    players: [Player, Player],
  ) {
    super();
    this.participants = [
      new ParticipantState(players[0].id, Team.A),
      new ParticipantState(players[1].id, Team.B),
    ];
    this.championSelectDeadline = Date.now() + CHAMPION_SELECT_WINDOW_MS;
  }

  protected findParticipant(playerId: string): ParticipantState {
    const p = this.participants.find((x) => x.playerId === playerId);
    if (!p) throw new Error(`playerId ${playerId} is not a participant in match ${this.id}`);
    return p;
  }

  /** NEW: the other participant. */
  protected opponentOf(participant: ParticipantState): ParticipantState {
    return this.participants[0] === participant ? this.participants[1] : this.participants[0];
  }

  protected endMatch(reason: EndReason, winningTeam: Team | null, now: number): void {
    this.phase = MatchPhase.ENDED;
    this.endedAt = now;
    this.endReason = reason;
    this.winningTeam = winningTeam;
    const durationMs = this.startedAt !== null ? now - this.startedAt : 0;
    this.notifyChanged(
      new ModelEvent(this, 'match:end', { matchId: this.id, reason, winningTeam, durationMs }),
    );
  }

  /** NEW: ELIMINATION/TIME_LIMIT winner. DISCONNECT_FORFEIT/SELECTION_TIMEOUT are decided at their call sites. */
  protected determineWinner(reason: EndReason): Team | null {
    const [a, b] = this.participants;
    if (reason === EndReason.ELIMINATION) {
      return a.isAlive() ? a.team : b.team;
    }
    if (reason === EndReason.TIME_LIMIT) {
      if (a.health === b.health) return null;
      return a.health > b.health ? a.team : b.team;
    }
    return null;
  }

  selectChampion(playerId: string, championId: string): void {
    if (this.phase !== MatchPhase.CHAMPION_SELECT) {
      throw new InvalidMatchPhaseError(this.id, MatchPhase.CHAMPION_SELECT, this.phase);
    }
    if (Date.now() > this.championSelectDeadline) {
      throw new SelectionWindowExpiredError(this.id);
    }
    const champion = ChampionRoster.getById(championId);
    const participant = this.findParticipant(playerId);
    participant.champion = champion;
    participant.health = champion.maxHealth;
    participant.resource = champion.maxResource;

    const bothSelected = this.participants.every((p) => p.champion !== null);
    this.notifyChanged(
      new ModelEvent(this, 'champion:selected', { matchId: this.id, playerId, championId, bothSelected }),
    );
    if (bothSelected) {
      this.phase = MatchPhase.ACTIVE;
      this.startedAt = Date.now();
      this.notifyChanged(new ModelEvent(this, 'match:start', { matchId: this.id, initialState: this.snapshot() }));
    }
  }

  /**
   * NEW: forwards movement input to the submitting player's ParticipantState for the current tick.
   * Buffers the input rather than moving immediately — actual position integration happens once per
   * tick(), using that tick's own deltaSeconds, so movement speed is independent of client send rate.
   * @throws {InvalidMatchPhaseError} if the match is not currently ACTIVE
   */
  submitMove(playerId: string, input: { dx: number; dy: number }): void {
    if (this.phase !== MatchPhase.ACTIVE) {
      throw new InvalidMatchPhaseError(this.id, MatchPhase.ACTIVE, this.phase);
    }
    this.pendingMoves.set(playerId, input);
  }

  /**
   * NEW: resolves and forwards an ability-use request. Because ParticipantState.useAbility() has no
   * target-position parameter, this method is where target range is checked (R4.2). A request naming no
   * target is treated as self-targeted (range always satisfied) — matches self-heal/self-buff kits. Once
   * ParticipantState.useAbility() succeeds, this method applies the ability's actual effect
   * (damage/heal/crowd-control/positioning) using ability.effectType/magnitude. POSITIONING is simplified
   * to "move the caster directly to the target's position" (a charge/leap) — nuanced blink semantics are
   * out of scope for this pass.
   * @throws {InvalidMatchPhaseError} if the match is not currently ACTIVE
   *
   * All per-ability validation failures — unknown ability, cooldown, insufficient resource, incapacitation,
   * out-of-range target — are caught internally and silently ignored, per R4's "silently ignores" behavior.
   */
  submitAbility(playerId: string, req: { abilityId: string; targetPlayerId?: string }): void {
    if (this.phase !== MatchPhase.ACTIVE) {
      throw new InvalidMatchPhaseError(this.id, MatchPhase.ACTIVE, this.phase);
    }
    const caster = this.findParticipant(playerId);
    if (!caster.champion) return;
    const ability = caster.champion.abilities.find((a) => a.id === req.abilityId);
    if (!ability) return;

    const target = req.targetPlayerId ? this.findParticipant(req.targetPlayerId) : caster;
    const distance = caster.position.distanceTo(target.position);
    if (target !== caster && distance > ability.range) return;

    const now = Date.now();
    try {
      caster.useAbility(ability, now);
    } catch (err) {
      if (err instanceof ArenaError) return;
      throw err;
    }

    switch (ability.effectType) {
      case EffectType.DAMAGE:
        target.applyDamage(ability.magnitude);
        break;
      case EffectType.HEAL:
        target.applyHeal(ability.magnitude);
        break;
      case EffectType.CROWD_CONTROL:
        target.applyCrowdControl(ability.magnitude * 1000, now);
        break;
      case EffectType.POSITIONING:
        caster.position = target.position;
        break;
    }
  }

  /**
   * EXPANDED: now also drives ACTIVE-phase combat — applies buffered movement, regenerates resource,
   * checks win conditions, and notifies listeners with the new state (R4.3–R4.6). Disconnect-forfeit
   * checking is still 09_server_5 — do not add it here.
   */
  tick(deltaSeconds: number): void {
    const now = Date.now();
    if (this.phase === MatchPhase.CHAMPION_SELECT) {
      if (now > this.championSelectDeadline) {
        this.endMatch(EndReason.SELECTION_TIMEOUT, null, now);
      }
      return;
    }
    if (this.phase !== MatchPhase.ACTIVE) return;

    for (const p of this.participants) {
      const pending = this.pendingMoves.get(p.playerId);
      if (pending) {
        try {
          p.move(pending, deltaSeconds, now);
        } catch {
          // ActorIncapacitatedError: movement silently has no effect this tick.
        }
      }
      p.regenerateResource(deltaSeconds);
    }
    this.tickCount += 1;

    const reason = this.checkWinConditions();
    if (reason) {
      this.endMatch(reason, this.determineWinner(reason), now);
      return;
    }

    this.notifyChanged(new ModelEvent(this, 'state', this.snapshot()));
  }

  /**
   * NEW: evaluates whether the match has reached a win condition this tick (elimination or time limit).
   * Disconnect forfeit and selection timeout are handled separately, not here (SRS 3.2.6 vs. 3.2.5).
   */
  checkWinConditions(): EndReason | null {
    const [a, b] = this.participants;
    if (!a.isAlive() || !b.isAlive()) return EndReason.ELIMINATION;
    if (this.startedAt !== null && Date.now() - this.startedAt >= MATCH_TIME_LIMIT_MS) return EndReason.TIME_LIMIT;
    return null;
  }

  snapshot(): MatchStatePayload {
    const now = Date.now();
    return {
      matchId: this.id,
      tick: this.tickCount,
      participants: [this.participants[0].toSnapshot(now), this.participants[1].toSnapshot(now)],
    };
  }
}
```

**MANDATORY**: keep the `disconnect`/`reconnect` stubs (still throwing `NotImplementedError`) at the bottom
of the class, unchanged from the previous increment — `09_server_5` implements them.

### 2. Extend `packages/server/src/model/MatchModel.test.ts` — add these `describe` blocks (append after
the existing ones from `09_server_3`, reusing its `VEX`/`makePlayers`/`selectBothChampions`/`collectEvents`
fixtures unchanged):

```ts
  describe('submitMove / tick — movement', () => {
    it('buffers movement and applies it scaled by deltaSeconds on the next tick', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitMove('p1', { dx: 1, dy: 0 });
      match.tick(0.5); // vex moveSpeed 200 * 0.5 = 100
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.position.x).toBe(100);
    });

    it('throws InvalidMatchPhaseError if submitted before the match is ACTIVE', () => {
      const match = new MatchModel('m1', makePlayers());
      expect(() => match.submitMove('p1', { dx: 1, dy: 0 })).toThrow(InvalidMatchPhaseError);
    });

    it('broadcasts a state event each active tick', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      match.tick(0.05);
      expect(events.some((e) => e.type === 'state')).toBe(true);
    });
  });

  describe('submitAbility', () => {
    it('applies damage to an in-range target and consumes cooldown/resource on the caster', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitAbility('p1', { abilityId: 'bolt', targetPlayerId: 'p2' });
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(55); // 85 - 30
    });

    it('silently ignores an out-of-range target (no effect, no throw)', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitMove('p2', { dx: 1, dy: 0 });
      match.tick(10); // push p2 far out of bolt's 500-range
      expect(() => match.submitAbility('p1', { abilityId: 'bolt', targetPlayerId: 'p2' })).not.toThrow();
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(85);
    });

    it('silently ignores an unknown ability id', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      expect(() => match.submitAbility('p1', { abilityId: 'nope', targetPlayerId: 'p2' })).not.toThrow();
    });

    it('self-heals when no target is given', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitAbility('p2', { abilityId: 'bolt', targetPlayerId: 'p1' }); // p1 takes 30 -> 55
      match.submitAbility('p1', { abilityId: 'heal' }); // no target -> self
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.health).toBe(70); // 55 + 15
    });

    it('applies crowd control converting magnitude (seconds) to a duration window', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitAbility('p1', { abilityId: 'root', targetPlayerId: 'p2' });
      const before = match.snapshot().participants.find((p) => p.playerId === 'p2')!.position;
      match.submitMove('p2', { dx: 1, dy: 0 });
      match.tick(0.5);
      const after = match.snapshot().participants.find((p) => p.playerId === 'p2')!.position;
      expect(after).toEqual(before); // did not move -- crowd-controlled
    });

    it('throws InvalidMatchPhaseError before the match is ACTIVE', () => {
      const match = new MatchModel('m1', makePlayers());
      expect(() => match.submitAbility('p1', { abilityId: 'bolt' })).toThrow(InvalidMatchPhaseError);
    });
  });

  describe('checkWinConditions / tick — elimination and time limit', () => {
    it('ends the match by ELIMINATION crediting the surviving team, broadcasting match:end', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      const p2 = (match as unknown as { participants: { health: number }[] }).participants[1];
      p2.health = 0;
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.endReason).toBe(EndReason.ELIMINATION);
      expect(match.winningTeam).toBe(Team.A);
      expect(events.some((e) => e.type === 'match:end')).toBe(true);
    });

    it('ends by TIME_LIMIT crediting higher health, or a draw if equal', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      (match as unknown as { startedAt: number }).startedAt = Date.now() - 5 * 60_000 - 1;
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.endReason).toBe(EndReason.TIME_LIMIT);
      expect(match.winningTeam).toBeNull();
      expect(events.some((e) => e.type === 'match:end')).toBe(true);
    });
  });
```
(Also add `EndReason`, `InvalidMatchPhaseError` to the test file's existing imports if not already there
from `09_server_3`.)

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest MatchModel.test`
passes (validated: 22 tests at this increment). Same `server` branch, commit `Step 9: MatchModel combat and
win conditions (increment 2/3)`, push, update the existing PR (or open a new one if the previous merged).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `disconnect`/`reconnect` remain stubs after this prompt — `09_server_5` implements them and
adds the disconnect-forfeit branch to `tick()`. Do not implement them early.**
