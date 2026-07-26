# Prompt 09_client_2 — Implement: `ClientMatchModel`

**Owner: Raj.**

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md` before executing this prompt.** Then read
`packages/client/src/model/ClientMatchModel.ts` — the stub below is transcribed from that file at
the time this prompt was written, but the file on disk is ground truth. If they differ, use the file.

**MANDATORY reminder (master context §1.1):** `ClientMatchModel` is a mirror, not an engine. Every
`apply*()` method stores what the server sent — it never merges, adjusts, or recomputes values.
The TSDoc on `applyMatchState` is explicit: "must store the payload without modification — no field
merging or client-side adjustment." Every test must assert the stored value equals the input
reference (same object, no field alteration).

---

### MANDATORY: Sandwich Requirement

- **Start**: `packages/client/src/model/ClientMatchModel.ts` compiles (`npm run typecheck -w
  @arena/client` passes before you change anything).
- **End**: `npm run typecheck -w @arena/client` still passes; `npx jest ClientMatchModel
  --coverage` is green with ≥ 100% statement coverage; `git status` shows only
  `ClientMatchModel.ts` modified and the new test file untracked/staged.

---

## 1. Stub (ground truth — read from disk)

```ts
import {
  AbstractModel, MatchId, MatchPhase, NotImplementedError,
  ChampionSelectedPayload, MatchStartPayload, MatchStatePayload, MatchEndPayload,
} from '@arena/shared';

/**
 * Mirror of authoritative match state as broadcast by the server (R4.1–R4.7).
 * Every field is populated exclusively by apply*() calls driven by server events — the client
 * never computes or overrides values here; it only stores what the server has sent.
 */
export class ClientMatchModel extends AbstractModel {
  /** Server-assigned match identifier; null until the match:start event is received. */
  public matchId: MatchId | null = null;

  /** Current phase of the match lifecycle; null until champion selection begins. */
  public phase: MatchPhase | null = null;

  /** Most recent authoritative state snapshot; null until the first match:state tick arrives. */
  public latestState: MatchStatePayload | null = null;

  /** Final match result payload; null until match:end is received. */
  public result: MatchEndPayload | null = null;

  /**
   * Records a champion selection event from the server (R3.3).
   * @param payload - the champion:selected event payload
   */
  applyChampionSelected(payload: ChampionSelectedPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyChampionSelected not yet implemented');
  }

  /**
   * Transitions the match into the COMBAT phase using the server's start payload (R4.1).
   * @param payload - the match:start event payload
   */
  applyMatchStart(payload: MatchStartPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchStart not yet implemented');
  }

  /**
   * Replaces latestState with the incoming authoritative snapshot (R4.7).
   * Must store the payload without modification — no field merging or client-side adjustment.
   * @param payload - the match:state broadcast from the server's tick loop
   */
  applyMatchState(payload: MatchStatePayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchState not yet implemented');
  }

  /**
   * Records the final result of the match as determined by the server (R5.1–R5.3).
   * @param payload - the match:end event payload
   */
  applyMatchEnd(payload: MatchEndPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchEnd not yet implemented');
  }
}
```

---

## 2. Implementation

**Key design facts before you write a line:**

- `phase` starts `null`. It is only set by `applyMatchStart()`, not by `applyChampionSelected()`.
  This is different from the *server's* `MatchModel`, which defaults `phase` to
  `CHAMPION_SELECT` on construction — the client model does not default the phase because it has
  no authority to do so. Only the server's `match:start` event triggers the phase transition.
- `applyMatchStart()` sets `phase` to `MatchPhase.ACTIVE` (not `CHAMPION_SELECT` — champion
  selection is already over at this point), stores `matchId`, and stores `initialState` directly
  into `latestState`.
- `applyMatchState()` is a single-line replacement: `this.latestState = payload`. No merge, no
  spread, no field-by-field copy.
- Add a `championSelection` field (`ChampionSelectedPayload | null = null`) for
  `applyChampionSelected()`. Check `docs/01_class_list.md` — if it is listed there, add it; if
  not, add it and update the class list in the same commit.

```ts
import {
  AbstractModel, MatchId, MatchPhase,
  ChampionSelectedPayload, MatchStartPayload, MatchStatePayload, MatchEndPayload,
} from '@arena/shared';

export class ClientMatchModel extends AbstractModel {
  public matchId: MatchId | null = null;
  public phase: MatchPhase | null = null;
  public latestState: MatchStatePayload | null = null;
  public result: MatchEndPayload | null = null;
  public championSelection: ChampionSelectedPayload | null = null;

  applyChampionSelected(payload: ChampionSelectedPayload): void {
    this.championSelection = payload;
  }

  applyMatchStart(payload: MatchStartPayload): void {
    this.matchId = payload.matchId;
    this.phase = MatchPhase.ACTIVE;
    this.latestState = payload.initialState;
  }

  applyMatchState(payload: MatchStatePayload): void {
    this.latestState = payload;
  }

  applyMatchEnd(payload: MatchEndPayload): void {
    this.result = payload;
  }
}
```

---

## 3. Test file

Create `packages/client/src/model/__tests__/ClientMatchModel.test.ts`:

```ts
import { ClientMatchModel } from '../ClientMatchModel';
import {
  MatchPhase, Team, ConnectionStatus, EndReason,
  ChampionSelectedPayload, MatchStartPayload, MatchStatePayload, MatchEndPayload,
  ParticipantSnapshot,
} from '@arena/shared';
import { Position } from '@arena/shared';

const makeParticipant = (playerId: string): ParticipantSnapshot => ({
  playerId,
  team: Team.A,
  championId: 'korr',
  position: new Position(0, 0),
  health: 180,
  resource: 100,
  cooldownsRemaining: {},
  crowdControlled: false,
  connectionStatus: ConnectionStatus.CONNECTED,
  alive: true,
});

const makeState = (matchId = 'match-1', tick = 1): MatchStatePayload => ({
  matchId,
  tick,
  participants: [makeParticipant('p1'), makeParticipant('p2')],
});

describe('ClientMatchModel', () => {
  it('starts with all fields null', () => {
    const m = new ClientMatchModel();
    expect(m.matchId).toBeNull();
    expect(m.phase).toBeNull();
    expect(m.latestState).toBeNull();
    expect(m.result).toBeNull();
  });

  it('phase stays null until applyMatchStart is called', () => {
    const m = new ClientMatchModel();
    const selection: ChampionSelectedPayload = {
      matchId: 'match-1', playerId: 'p1', championId: 'korr', bothSelected: false,
    };
    m.applyChampionSelected(selection);
    expect(m.phase).toBeNull();
  });

  describe('applyChampionSelected()', () => {
    it('stores the champion selection payload exactly as given — same reference, no alteration', () => {
      const m = new ClientMatchModel();
      const payload: ChampionSelectedPayload = {
        matchId: 'match-1', playerId: 'p1', championId: 'vex', bothSelected: true,
      };
      m.applyChampionSelected(payload);
      expect(m.championSelection).toBe(payload);
    });
  });

  describe('applyMatchStart()', () => {
    it('stores matchId from the server payload as-is — no alteration', () => {
      const m = new ClientMatchModel();
      m.applyMatchStart({ matchId: 'match-99', initialState: makeState('match-99') });
      expect(m.matchId).toBe('match-99');
    });

    it('sets phase to ACTIVE', () => {
      const m = new ClientMatchModel();
      m.applyMatchStart({ matchId: 'match-1', initialState: makeState() });
      expect(m.phase).toBe(MatchPhase.ACTIVE);
    });

    it('stores the initial state exactly as given — same reference, no alteration', () => {
      const m = new ClientMatchModel();
      const state = makeState();
      m.applyMatchStart({ matchId: 'match-1', initialState: state });
      expect(m.latestState).toBe(state);
    });
  });

  describe('applyMatchState()', () => {
    it('replaces latestState with the server payload exactly — no field merging or alteration', () => {
      const m = new ClientMatchModel();
      const first = makeState('match-1', 1);
      const second = makeState('match-1', 2);
      m.applyMatchStart({ matchId: 'match-1', initialState: first });
      m.applyMatchState(second);
      expect(m.latestState).toBe(second);
      expect(m.latestState!.participants).toBe(second.participants); // same reference
    });
  });

  describe('applyMatchEnd()', () => {
    it('stores the match-end payload exactly as given — same reference, no alteration', () => {
      const m = new ClientMatchModel();
      const payload: MatchEndPayload = {
        matchId: 'match-1', reason: EndReason.ELIMINATION,
        winningTeam: Team.A, durationMs: 42000,
      };
      m.applyMatchEnd(payload);
      expect(m.result).toBe(payload);
    });
  });
});
```

---

## 4. Verification and Git

**Step 1 — typecheck:**
```
npm run typecheck -w @arena/client
```

**Step 2 — tests with coverage:**
```
npx jest --testPathPattern="ClientMatchModel" --coverage --coveragePathPattern="model/ClientMatchModel"
```
Expected: **6 tests pass**, **100% statements, 100% branches, 100% functions** on
`ClientMatchModel.ts`.

**Step 3 — git:**
```bash
git add packages/client/src/model/ClientMatchModel.ts \
        packages/client/src/model/__tests__/ClientMatchModel.test.ts
git commit -m "Step 9 client: implement ClientMatchModel"
git push origin client
```

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `applyMatchState` is the highest-risk method here — it is called 20 times per second
in a running match. The test asserting `m.latestState === payload` (same reference, not a copy)
is the concrete proof that no merge or field adjustment is happening. If your implementation
spreads or copies fields, that test will fail — and it should. The server's broadcast is the truth;
store it whole.**
