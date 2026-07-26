# Prompt 09_server_3 — MatchModel: Champion Selection (increment 1 of 3)

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
**MANDATORY prerequisite: `09_server_2` (ParticipantState) must be merged to `main` first** — this prompt
imports it directly. This is increment 1 of 3 for `MatchModel` — `tick()` gets built up incrementally
across `09_server_3`/`_4`/`_5`; this increment only gives it the CHAMPION_SELECT-phase branch. Don't add
ACTIVE-phase combat logic yet, even though you can see where it will go — that's `09_server_4`.

---

### 1. Replace `packages/server/src/model/MatchModel.ts` with:

```ts
import {
  AbstractModel,
  MatchId,
  MatchPhase,
  EndReason,
  Team,
  Player,
  MatchStatePayload,
  ModelEvent,
  ChampionRoster,
  InvalidMatchPhaseError,
  SelectionWindowExpiredError,
} from '@arena/shared';
import { ParticipantState } from './ParticipantState';

const CHAMPION_SELECT_WINDOW_MS = 30_000;

/**
 * One instance of gameplay, champion selection through a win condition — the authoritative source of
 * truth for both participants (2.1, R4.1). Owns exactly two ParticipantState (1v1 scope) and notifies its
 * MatchBroadcastView listener on every state-relevant change via AbstractModel.
 */
export class MatchModel extends AbstractModel {
  /** Current stage of the match; most operations below are only valid in one specific phase. */
  public phase: MatchPhase = MatchPhase.CHAMPION_SELECT;
  private participants: [ParticipantState, ParticipantState];
  /** Simulation timestamp (ms) by which both players must select a champion, or the match ends (R3.4). */
  public championSelectDeadline: number;
  /** Simulation timestamp (ms) the ACTIVE phase began, or null before combat starts. */
  public startedAt: number | null = null;
  /** Simulation timestamp (ms) the match ended, or null while still in progress. */
  public endedAt: number | null = null;
  /** Why the match ended, or null while still in progress (R5.3). */
  public endReason: EndReason | null = null;
  /** The winning team, or null for a draw or a match still in progress. */
  public winningTeam: Team | null = null;
  /** Incrementing tick counter included in every broadcast snapshot; not a timestamp. */
  private tickCount = 0;

  constructor(
    /** Stable identifier for this match. */
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

  /**
   * Records a player's champion choice during Champion Select.
   * @param playerId - the selecting player
   * @param championId - the chosen champion's identifier
   * @throws {InvalidChampionSelectionError} if championId does not match any champion in the roster (R3.2)
   * @throws {SelectionWindowExpiredError} if the 30-second selection window has elapsed (R3.4)
   * @throws {InvalidMatchPhaseError} if the match is not currently in CHAMPION_SELECT
   */
  selectChampion(playerId: string, championId: string): void {
    if (this.phase !== MatchPhase.CHAMPION_SELECT) {
      throw new InvalidMatchPhaseError(this.id, MatchPhase.CHAMPION_SELECT, this.phase);
    }
    if (Date.now() > this.championSelectDeadline) {
      throw new SelectionWindowExpiredError(this.id);
    }
    const champion = ChampionRoster.getById(championId); // throws InvalidChampionSelectionError
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
   * Advances the match simulation by one tick. During CHAMPION_SELECT, only checks the 30s selection
   * deadline (R3.4) — the ACTIVE-phase branch (movement, combat, win conditions) is added in 09_server_4;
   * disconnect-forfeit handling is added in 09_server_5. A no-op once ENDED.
   * CRITICAL: called by TickLoop.onTick() up to 20x/sec, once per registered match. This method itself
   * must never throw uncaught — TickLoop wraps each call in a per-match try/catch specifically so one
   * match's internal error cannot crash the loop or affect any other in-progress match (R5.4, 3.6.2).
   * @param deltaSeconds - elapsed simulation time since the previous tick
   */
  tick(deltaSeconds: number): void {
    const now = Date.now();
    if (this.phase === MatchPhase.CHAMPION_SELECT) {
      if (now > this.championSelectDeadline) {
        this.endMatch(EndReason.SELECTION_TIMEOUT, null, now);
      }
      return;
    }
    // ACTIVE-phase handling lands in 09_server_4.
  }

  /** @returns a read-only snapshot of both participants and match metadata, for broadcast to clients. */
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

**Note**: `findParticipant` and `endMatch` are declared `protected` (not `private`) because `09_server_4`
and `09_server_5` extend this same class body with more methods that need them — when those prompts run,
they replace this whole file with the fuller version (not literal subclassing); `protected` here is just
forward-consistency with the final shape, harmless either way. `checkWinConditions`, `submitMove`,
`submitAbility`, `disconnect`, `reconnect` are intentionally not present yet.

### 2. Create `packages/server/src/model/MatchModel.test.ts` with (only the champion-select-relevant tests
— `09_server_4` and `09_server_5` will extend this same test file):

```ts
import {
  Team,
  MatchPhase,
  EndReason,
  Player,
  Champion,
  Ability,
  EffectType,
  ChampionRoster,
  ModelListener,
  InvalidMatchPhaseError,
  SelectionWindowExpiredError,
  InvalidChampionSelectionError,
} from '@arena/shared';
import { MatchModel } from './MatchModel';

const VEX = new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 10, 200, [
  new Ability('bolt', 'Arcane Bolt', 5, 20, 500, EffectType.DAMAGE, 30),
  new Ability('heal', 'Self Mend', 8, 30, 0, EffectType.HEAL, 15),
  new Ability('root', 'Frost Lance', 6, 25, 400, EffectType.CROWD_CONTROL, 1.5),
  new Ability('blink', 'Phase Step', 10, 20, 300, EffectType.POSITIONING, 0),
]);

function makePlayers(): [Player, Player] {
  return [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
}

function selectBothChampions(match: MatchModel): void {
  match.selectChampion('p1', 'vex');
  match.selectChampion('p2', 'vex');
}

function collectEvents(match: MatchModel): { type: string; payload: unknown }[] {
  const events: { type: string; payload: unknown }[] = [];
  const listener: ModelListener = { modelChanged: (e) => events.push({ type: e.type, payload: e.payload }) };
  match.addModelListener(listener);
  return events;
}

describe('MatchModel', () => {
  beforeEach(() => {
    jest.spyOn(ChampionRoster, 'getById').mockImplementation((id: string) => {
      if (id === 'vex') return VEX;
      throw new InvalidChampionSelectionError(id);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('construction', () => {
    it('starts in CHAMPION_SELECT with a 30s deadline', () => {
      const before = Date.now();
      const match = new MatchModel('m1', makePlayers());
      expect(match.phase).toBe(MatchPhase.CHAMPION_SELECT);
      expect(match.championSelectDeadline).toBeGreaterThanOrEqual(before + 30_000);
      expect(match.championSelectDeadline).toBeLessThan(before + 31_000);
    });
  });

  describe('selectChampion', () => {
    it('sets the participant champion and broadcasts champion:selected', () => {
      const match = new MatchModel('m1', makePlayers());
      const events = collectEvents(match);
      match.selectChampion('p1', 'vex');
      expect(events[0].type).toBe('champion:selected');
      expect((events[0].payload as { bothSelected: boolean }).bothSelected).toBe(false);
    });

    it('sets health/resource to the champion max on selection (verified once both selected)', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const snap = match.snapshot();
      const p1 = snap.participants.find((p) => p.playerId === 'p1')!;
      expect(p1.health).toBe(85);
      expect(p1.resource).toBe(100);
    });

    it('transitions to ACTIVE and broadcasts match:start once both players have selected', () => {
      const match = new MatchModel('m1', makePlayers());
      const events = collectEvents(match);
      selectBothChampions(match);
      expect(match.phase).toBe(MatchPhase.ACTIVE);
      expect(match.startedAt).not.toBeNull();
      expect(events.some((e) => e.type === 'match:start')).toBe(true);
    });

    it('throws InvalidChampionSelectionError for an unknown champion', () => {
      const match = new MatchModel('m1', makePlayers());
      expect(() => match.selectChampion('p1', 'nope')).toThrow(InvalidChampionSelectionError);
    });

    it('throws SelectionWindowExpiredError after the 30s deadline', () => {
      const match = new MatchModel('m1', makePlayers());
      match.championSelectDeadline = Date.now() - 1;
      expect(() => match.selectChampion('p1', 'vex')).toThrow(SelectionWindowExpiredError);
    });

    it('throws InvalidMatchPhaseError once already ACTIVE', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      expect(() => match.selectChampion('p1', 'vex')).toThrow(InvalidMatchPhaseError);
    });
  });

  describe('tick — champion select phase', () => {
    it('ends the match with SELECTION_TIMEOUT once the deadline passes, without touching combat state', () => {
      const match = new MatchModel('m1', makePlayers());
      const events = collectEvents(match);
      match.championSelectDeadline = Date.now() - 1;
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.endReason).toBe(EndReason.SELECTION_TIMEOUT);
      expect(match.winningTeam).toBeNull();
      expect(events.some((e) => e.type === 'match:end')).toBe(true);
    });

    it('is a no-op before the deadline', () => {
      const match = new MatchModel('m1', makePlayers());
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.CHAMPION_SELECT);
    });
  });

  describe('snapshot', () => {
    it('includes both participants and matchId', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      expect(match.snapshot().participants).toHaveLength(2);
      expect(match.snapshot().matchId).toBe('m1');
    });
  });
});
```

**MANDATORY**: this test file's fixtures (`VEX`, `makePlayers`, `selectBothChampions`, `collectEvents`) are
reused and extended by `09_server_4` and `09_server_5` — keep the exact names and shapes above so those
prompts' additions paste in cleanly rather than needing to redeclare fixtures.

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest MatchModel.test`
passes (validated: 11 tests at this increment). Branch `server` (continue on the branch from `09_server_2`
if still open locally, or recreate from `main` if that merged already), commit `Step 9: MatchModel champion
selection (increment 1/3)`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Do not implement `submitMove`, `submitAbility`, `checkWinConditions`, `disconnect`, or
`reconnect` in this prompt — they still throw `NotImplementedError` from the original stub, which is
correct for this increment. Deleting the stub methods entirely (rather than leaving them for the next two
prompts to fill in) would break `docs/01_class_list.md`'s documented API surface.**

Actually — re-read `docs/01_class_list.md` §5a: the original stub file had all seven methods declared. To
keep the file compiling with the declared API surface intact while only *implementing* champion-select and
snapshot this increment, add the remaining five method stubs back (unchanged from the original file — each
still throwing `NotImplementedError`) at the bottom of the class, in the order the class list documents
them: `submitMove`, `submitAbility`, `checkWinConditions`, `disconnect`, `reconnect`. Copy their exact
original signatures/TSDoc from `git show HEAD:packages/server/src/model/MatchModel.ts` before this
prompt's changes, or from `docs/01_class_list.md` §5a if that file is unavailable.
