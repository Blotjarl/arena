# Prompt 09_api_1 — PendingMatchCorrelator Implementation

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first. This
prompt's code below is already validated (implemented and test-run against this real repo, then reverted
to the stub so the actual commit happens through your own branch/PR flow) — you are transcribing proven
work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL CHECKPOINT (prompts/00_master_context.md §8, prompts/09-10_implementation_plan.md §2 item 4)
`recordBegin`/`recordEnd` must be idempotent per `matchId` — calling either twice must not create a
duplicate pending entry or return a second combined record. This is one of the six pre-identified
critical-checkpoint areas and gets a named test proving it, not just a happy-path test.

**No database dependency** — this class is a pure in-memory `Map`, tested with plain Jest, no Docker
needed (`prompts/09-10_implementation_plan.md` §3). You do not need `09_api_2` merged to do this prompt.

### Design note: participant/outcome shapes
The current stub types `participants`/`outcome` as `unknown`. `docs/01_class_list.md`'s entry for this
class (`recordBegin(matchId: MatchId, participants: {...}): void`; `recordEnd(matchId: MatchId, outcome:
{...}): {begin, end} | null`) leaves those shapes as placeholders — they were never pinned down. This
prompt pins them down as two exported interfaces, `BeginParticipant` (a participant's begin-time
selections: `playerId`, `team`, `championId` — matching what `MatchReportingClient.reportMatchBegin`
already declares it sends, `MatchParticipant[]`, minus the `result` field which isn't known until the
match ends) and `MatchOutcome` (`endReason`, `winningTeam`, `durationMs`, `endedAt` — matching what
`MatchReportingClient.reportMatchEnd`'s doc comment says it sends). The combined return type is renamed
from the stub's generic `{begin, end} | null` to `CorrelatedMatchReport | null` for clarity at the call
site (`InternalMatchController`, Step 10) — same shape, clearer field names (`participants`/`outcome`
instead of `begin`/`end`).

---

### 1. Replace `packages/api/src/model/PendingMatchCorrelator.ts` with:

```ts
import { MatchId, PlayerId, ChampionId, Team, EndReason } from '@arena/shared';

/** One participant's begin-time selections, as reported by `MatchReportingClient.reportMatchBegin`. */
export interface BeginParticipant {
  playerId: PlayerId;
  team: Team;
  championId: ChampionId;
}

/** A match's end-time outcome, as reported by `MatchReportingClient.reportMatchEnd`. */
export interface MatchOutcome {
  endReason: EndReason;
  winningTeam: Team | null;
  durationMs: number;
  endedAt: Date;
}

/** The combined record `InternalMatchController` hands to `MatchRepository.recordMatch` once both report halves have arrived. */
export interface CorrelatedMatchReport {
  participants: BeginParticipant[];
  outcome: MatchOutcome;
}

interface PendingRecord {
  begin?: BeginParticipant[];
  end?: MatchOutcome;
}

/**
 * Reconciles the server's two separate HTTP reports (match begin, match end — SRS 3.2.7.4 step 26) into
 * one record ready for MatchRepository.recordMatch(). CRITICAL CHECKPOINT (prompts/00_master_context.md
 * §8): recordEnd/recordBegin must be idempotent per matchId — a retried report must not double-persist.
 */
export class PendingMatchCorrelator {
  private pending: Map<MatchId, PendingRecord> = new Map();
  /** matchIds already handed off to the caller via recordEnd — guards against a retried report reviving a completed match. */
  private completed: Set<MatchId> = new Set();

  /**
   * Records the "match begin" half of a match report. Idempotent per `matchId` — a retried begin report
   * for a matchId already recorded must not create a second pending entry.
   * @param matchId - the match this report belongs to
   * @param participants - the two participants as reported at match start
   */
  recordBegin(matchId: MatchId, participants: BeginParticipant[]): void {
    if (this.completed.has(matchId)) return;
    const existing = this.pending.get(matchId);
    if (existing?.begin) return;
    this.pending.set(matchId, { ...existing, begin: participants });
  }

  /**
   * Records the "match end" half of a match report. Idempotent per `matchId` — a retried end report must
   * not double-persist by returning a second combined record for the same match.
   * @param matchId - the match this report belongs to
   * @param outcome - the match's outcome as reported at match end
   * @returns the combined `{participants, outcome}` record once both halves are present for this
   *   `matchId`, otherwise `null`
   */
  recordEnd(matchId: MatchId, outcome: MatchOutcome): CorrelatedMatchReport | null {
    if (this.completed.has(matchId)) return null;
    const existing = this.pending.get(matchId) ?? {};
    if (existing.end) return null;
    const updated: PendingRecord = { ...existing, end: outcome };
    if (!updated.begin) {
      this.pending.set(matchId, updated);
      return null;
    }
    this.pending.delete(matchId);
    this.completed.add(matchId);
    return { participants: updated.begin, outcome };
  }
}
```

**Note on out-of-order reports**: per `docs/01_class_list.md`, `recordBegin` returns `void` — if an `end`
report somehow arrives before its matching `begin` (out-of-order network delivery), that `recordEnd` call
stores the outcome and returns `null`; it is not retroactively combined by the later `recordBegin` call.
Only a subsequent `recordEnd` call completes the pairing. In practice `MatchModel` only calls
`reportMatchEnd` after a match has already called `reportMatchBegin`, so true reordering would require the
begin request to be delayed on the wire past the end request — an edge case worth knowing about, not one
this class needs to solve.

### 2. Create `packages/api/src/model/PendingMatchCorrelator.test.ts` with:

```ts
import { Team, EndReason } from '@arena/shared';
import { PendingMatchCorrelator, BeginParticipant, MatchOutcome } from './PendingMatchCorrelator';

function makeParticipants(): BeginParticipant[] {
  return [
    { playerId: 'player-1', team: Team.A, championId: 'korr' },
    { playerId: 'player-2', team: Team.B, championId: 'vex' },
  ];
}

function makeOutcome(): MatchOutcome {
  return { endReason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 42000, endedAt: new Date('2026-01-01T00:00:00Z') };
}

describe('PendingMatchCorrelator', () => {
  it('returns null from recordEnd when begin has not been recorded yet', () => {
    const correlator = new PendingMatchCorrelator();
    expect(correlator.recordEnd('match-1', makeOutcome())).toBeNull();
  });

  it('combines begin and end into one record once both halves are present', () => {
    const correlator = new PendingMatchCorrelator();
    const participants = makeParticipants();
    const outcome = makeOutcome();
    correlator.recordBegin('match-1', participants);
    const combined = correlator.recordEnd('match-1', outcome);
    expect(combined).toEqual({ participants, outcome });
  });

  it('CRITICAL CHECKPOINT: recordBegin is idempotent — a retried begin does not create a duplicate pending entry', () => {
    const correlator = new PendingMatchCorrelator();
    const first = makeParticipants();
    const retried: BeginParticipant[] = [{ playerId: 'someone-else', team: Team.A, championId: 'rin' }];
    correlator.recordBegin('match-1', first);
    correlator.recordBegin('match-1', retried); // must be ignored — first recording wins
    const combined = correlator.recordEnd('match-1', makeOutcome());
    expect(combined?.participants).toEqual(first);
  });

  it('CRITICAL CHECKPOINT: recordEnd is idempotent — calling it twice does not return a second combined record', () => {
    const correlator = new PendingMatchCorrelator();
    correlator.recordBegin('match-1', makeParticipants());
    const outcome = makeOutcome();
    const firstResult = correlator.recordEnd('match-1', outcome);
    const secondResult = correlator.recordEnd('match-1', outcome);
    expect(firstResult).not.toBeNull();
    expect(secondResult).toBeNull();
  });

  it('CRITICAL CHECKPOINT: a retried begin after completion does not resurrect a finished match', () => {
    const correlator = new PendingMatchCorrelator();
    correlator.recordBegin('match-1', makeParticipants());
    correlator.recordEnd('match-1', makeOutcome());
    correlator.recordBegin('match-1', makeParticipants()); // retried begin, arriving after completion
    expect(correlator.recordEnd('match-1', makeOutcome())).toBeNull();
  });

  it('tracks multiple matchIds independently', () => {
    const correlator = new PendingMatchCorrelator();
    correlator.recordBegin('match-1', makeParticipants());
    correlator.recordBegin('match-2', makeParticipants());
    expect(correlator.recordEnd('match-2', makeOutcome())).not.toBeNull();
    expect(correlator.recordEnd('match-1', makeOutcome())).not.toBeNull();
  });

  it('a repeated recordEnd arriving before recordBegin does not throw and stays null (still no begin to pair with)', () => {
    const correlator = new PendingMatchCorrelator();
    const outcome = makeOutcome();
    expect(correlator.recordEnd('match-1', outcome)).toBeNull();
    expect(correlator.recordEnd('match-1', outcome)).toBeNull(); // idempotent — no duplicate pending entry
    correlator.recordBegin('match-1', makeParticipants());
    // Per docs/01_class_list.md, recordBegin returns void — an end that arrived before begin is not
    // retroactively combined by this call; only a *new* recordEnd call can complete the pairing.
  });
});
```

---

### 3. Verification and Git
```
npm run typecheck -w @arena/api
npx jest PendingMatchCorrelator --coverage --collectCoverageFrom="src/model/PendingMatchCorrelator.ts"
```
Validated result: 7/7 tests passing, 100% statement/branch/function/line coverage on
`PendingMatchCorrelator.ts`, including both named critical-checkpoint tests. Per master context §9.4:
branch `api` from `main` (`git branch -D api 2>/dev/null; git checkout -b api main`) if you don't already
have work in progress on it, commit `Step 9: PendingMatchCorrelator implementation and tests`, push, open a
PR into `main` (or fold into an existing in-flight `api`-branch PR alongside the other three prompts in
this batch).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `InternalMatchController` (Step 10) depends on this class's exact final shape — in particular
the `BeginParticipant`/`MatchOutcome`/`CorrelatedMatchReport` interfaces introduced here, which did not
exist in the original stub. Do not deviate from them without updating this file and flagging the change.**
