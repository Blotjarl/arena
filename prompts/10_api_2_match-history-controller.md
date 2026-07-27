# Prompt 10_api_2 — MatchHistoryController + MatchHistoryResponseView Implementation

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first. This
prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisites
1. `packages/api`'s entire model package (`09_api_1` through `09_api_5`) must already be merged to `main` —
   confirm via `git log`.
2. **`10_api_1` must be merged first** — this prompt imports `NULL_MODEL`/`NULL_VIEW` from
   `packages/api/src/controller/nullMvc.ts`, created there. Do not recreate that file here.

---

### Design note: correction to `MatchRepository.findHistoryForPlayer`'s return shape
The already-merged `findHistoryForPlayer` (`09_api_4`) returns `MatchParticipant[]`. Building
`MatchHistoryEntryDTO` (R7.3's wire shape) needs each match's **opponent username**, and `MatchParticipant` —
a fixed per-participant persistence row, `docs/01_class_list.md` §4a — has no opponent reference at all.
Real implementation fixes this at the source rather than bolting an N+1 follow-up lookup onto the
controller: the query in `findHistoryForPlayer` now self-joins `match_participants` (excluding the querying
player's own row — a 1v1 match always has exactly one other participant) plus `players` for that opponent's
username, and returns a new enriched shape, `MatchHistoryRow`, instead of `MatchParticipant[]`. This is the
same category of correction `10_server_2` made to `MatchmakingQueue.join`/`cancel` — a small, necessary
change to an already-merged Step 9 model method, discovered and validated by implementing this controller
for real, not a redesign of that method's actual persistence logic (the SQL still targets the same two
tables, and `recordMatch` is untouched).

`MatchHistoryResponseView`'s stub signature (`render(participants: MatchParticipant[])`) is corrected to
match — this is this prompt's own file, not an already-merged one, so no separate flag is needed for that
half.

---

### 0. Correction to `packages/api/src/model/MatchRepository.ts`

Replace the whole file with:

```ts
import { Match, MatchParticipant, PlayerId, ChampionId, MatchId, MatchResult, EndReason } from '@arena/shared';
import { PgPool } from '../util/PgPool';

/**
 * One row of a player's match history, joined with the match's opponent (R7.3). `MatchParticipant` alone
 * can't carry `opponentUsername` — it's a fixed per-participant persistence row (`docs/01_class_list.md`
 * §4a) with no opponent reference — so `findHistoryForPlayer` returns this enriched shape instead, built by
 * a single query (a self-join on `match_participants`) rather than an N+1 follow-up lookup per row.
 */
export interface MatchHistoryRow {
  matchId: MatchId;
  opponentUsername: string;
  championId: ChampionId;
  result: MatchResult;
  endReason: EndReason;
  durationMs: number;
  endedAt: Date;
}

interface MatchHistoryQueryRow {
  match_id: string;
  opponent_username: string;
  champion_id: string;
  result: string;
  end_reason: string;
  duration_ms: number;
  ended_at: string;
}

function toMatchHistoryRow(row: MatchHistoryQueryRow): MatchHistoryRow {
  return {
    matchId: row.match_id,
    opponentUsername: row.opponent_username,
    championId: row.champion_id,
    result: row.result as MatchResult,
    endReason: row.end_reason as EndReason,
    durationMs: row.duration_ms,
    endedAt: new Date(row.ended_at),
  };
}

/** Persists completed matches and serves paginated match history (R7.1, R7.3, R-DB2, R-DB5). */
export class MatchRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Writes one `Match` row plus its `MatchParticipant` rows (exactly one per player) as a single unit
   * (R7.1, R-DB2, R-DB4) — via `PgPool.transaction`, so a failure partway through leaves neither row
   * behind. Precondition: the match reached at least `ACTIVE` phase before ending — a match that ended
   * during Champion Select must not be recorded (R7.2). Enforcing that precondition is the caller's
   * (`InternalMatchController`'s) responsibility; this method persists whatever it is given.
   * @param match - the completed match's summary record
   * @param participants - the two participants' per-match outcome rows
   * @throws {PersistenceError} if the underlying write fails
   */
  async recordMatch(match: Match, participants: MatchParticipant[]): Promise<void> {
    await this.pool.transaction(async (query) => {
      await query(
        'INSERT INTO matches (id, end_reason, winning_team, duration_ms, ended_at) VALUES ($1, $2, $3, $4, $5)',
        [match.id, match.endReason, match.winningTeam, match.durationMs, match.endedAt],
      );
      for (const participant of participants) {
        await query(
          'INSERT INTO match_participants (match_id, player_id, team, champion_id, result) VALUES ($1, $2, $3, $4, $5)',
          [participant.matchId, participant.playerId, participant.team, participant.championId, participant.result],
        );
      }
    });
  }

  /**
   * Looks up a player's match history, most-recent-first (R7.3, R-DB5). `page` is 1-indexed — page 1 is
   * the most recent `pageSize` matches.
   *
   * CORRECTION (Step 10): originally returned `MatchParticipant[]`, but `MatchHistoryResponseView`
   * (`10_api_2`) needs each row's opponent username for `MatchHistoryEntryDTO` (R7.3's wire shape), and
   * `MatchParticipant` has no opponent reference. Real implementation joins `match_participants` to itself
   * (on `match_id`, excluding the querying player's own row — 1v1 matches always have exactly one other
   * participant) plus `players` for that opponent's username, in one query, and returns the enriched
   * `MatchHistoryRow` shape instead.
   * @param playerId - the player whose history to fetch
   * @param page - 1-indexed page number
   * @param pageSize - number of entries per page
   * @returns the page of `MatchHistoryRow`s for that player
   * @throws {PersistenceError} if the underlying query fails
   */
  async findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchHistoryRow[]> {
    const offset = (page - 1) * pageSize;
    const rows = await this.pool.query<MatchHistoryQueryRow>(
      `SELECT
         mp.match_id AS match_id,
         opp.username AS opponent_username,
         mp.champion_id AS champion_id,
         mp.result AS result,
         m.end_reason AS end_reason,
         m.duration_ms AS duration_ms,
         m.ended_at AS ended_at
       FROM match_participants mp
       JOIN matches m ON m.id = mp.match_id
       JOIN match_participants opp_mp ON opp_mp.match_id = mp.match_id AND opp_mp.player_id != mp.player_id
       JOIN players opp ON opp.id = opp_mp.player_id
       WHERE mp.player_id = $1
       ORDER BY m.ended_at DESC
       LIMIT $2 OFFSET $3`,
      [playerId, pageSize, offset],
    );
    return rows.map(toMatchHistoryRow);
  }
}
```

And update `packages/api/src/model/MatchRepository.test.ts`'s `findHistoryForPlayer` describe block's first
test (the `.matchId` assertions stay valid unchanged; add opponent/DTO-field assertions to actually exercise
the join):

```ts
      const page1 = await repo.findHistoryForPlayer(PLAYER_A, 1, 2);
      expect(page1.map((p) => p.matchId)).toEqual(['match-repo-test-h3', 'match-repo-test-h2']);
      expect(page1[0]).toMatchObject({
        opponentUsername: 'MatchRepoTestPlayerB',
        championId: 'korr',
        result: MatchResult.WIN,
        endReason: EndReason.ELIMINATION,
        durationMs: 90_000,
      });
      expect(page1[0].endedAt).toBeInstanceOf(Date);

      const page2 = await repo.findHistoryForPlayer(PLAYER_A, 2, 2);
      expect(page2.map((p) => p.matchId)).toEqual(['match-repo-test-h1']);
```

(Requires `npm run test:db:up` first, same as every other `MatchRepository`/`LeaderboardRepository` test —
`packages/api/schema.sql` is applied automatically via Postgres's init-scripts mechanism.)

### 1. Replace `packages/api/src/view/MatchHistoryResponseView.ts` with:

```ts
import { MatchHistoryEntryDTO } from '@arena/shared';
import { MatchHistoryRow } from '../model/MatchRepository';

/**
 * Formats `MatchHistoryRow[]` into the wire-shaped, paginated `MatchHistoryEntryDTO[]` for a REST response.
 * A plain formatter, not a `View` implementer — a synchronous HTTP response has no push/observe
 * relationship to establish.
 *
 * CORRECTION (Step 10): the original stub's signature took `MatchParticipant[]`, but that domain type
 * carries no `opponentUsername` — see `MatchRepository.findHistoryForPlayer`'s Step 10 correction
 * (`10_api_2`), which now returns the enriched `MatchHistoryRow` shape instead. This view's only remaining
 * job is the `Date` → ISO-8601 string conversion `MatchHistoryEntryDTO` requires for the wire.
 */
export class MatchHistoryResponseView {
  /**
   * @param rows - the page of match-history rows to format
   * @returns the DTO array to send as the JSON response body
   */
  render(rows: MatchHistoryRow[]): MatchHistoryEntryDTO[] {
    return rows.map((row) => ({
      matchId: row.matchId,
      opponentUsername: row.opponentUsername,
      championId: row.championId,
      result: row.result,
      endReason: row.endReason,
      durationMs: row.durationMs,
      endedAt: row.endedAt.toISOString(),
    }));
  }
}
```

### 2. Create `packages/api/src/view/MatchHistoryResponseView.test.ts` with:

```ts
import { MatchResult, EndReason } from '@arena/shared';
import { MatchHistoryResponseView } from './MatchHistoryResponseView';
import { MatchHistoryRow } from '../model/MatchRepository';

function makeRow(overrides: Partial<MatchHistoryRow> = {}): MatchHistoryRow {
  return {
    matchId: 'match-1',
    opponentUsername: 'Bob',
    championId: 'korr',
    result: MatchResult.WIN,
    endReason: EndReason.ELIMINATION,
    durationMs: 90_000,
    endedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('MatchHistoryResponseView', () => {
  describe('render', () => {
    it('maps each row to a MatchHistoryEntryDTO, converting endedAt to an ISO string', () => {
      const view = new MatchHistoryResponseView();
      const result = view.render([makeRow()]);
      expect(result).toEqual([
        {
          matchId: 'match-1',
          opponentUsername: 'Bob',
          championId: 'korr',
          result: MatchResult.WIN,
          endReason: EndReason.ELIMINATION,
          durationMs: 90_000,
          endedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('returns an empty array for an empty input', () => {
      const view = new MatchHistoryResponseView();
      expect(view.render([])).toEqual([]);
    });

    it('preserves row order and formats multiple rows', () => {
      const view = new MatchHistoryResponseView();
      const rows = [
        makeRow({ matchId: 'match-1', result: MatchResult.WIN }),
        makeRow({ matchId: 'match-2', result: MatchResult.LOSS, opponentUsername: 'Carol' }),
      ];
      const result = view.render(rows);
      expect(result.map((r) => r.matchId)).toEqual(['match-1', 'match-2']);
      expect(result[1].opponentUsername).toBe('Carol');
      expect(result[1].result).toBe(MatchResult.LOSS);
    });
  });
});
```

### 3. Replace `packages/api/src/controller/MatchHistoryController.ts` with:

```ts
import { AbstractController, NotImplementedError, ArenaError, ValidationError, PlayerId } from '@arena/shared';
import type { Request, Response } from 'express';
import { MatchRepository } from '../model/MatchRepository';
import { MatchHistoryResponseView } from '../view/MatchHistoryResponseView';
import { ErrorResponseView } from '../view/ErrorResponseView';
import { NULL_MODEL, NULL_VIEW } from './nullMvc';

/**
 * `GET /players/:id/matches?page=&pageSize=` — serves a player's paginated match history (R7.3).
 *
 * Uses the default (untyped) `AbstractController` generics via the shared `NULL_MODEL`/`NULL_VIEW`
 * stand-in — see `10_api_1`'s design note 4 for why: no domain `Model` this REST controller observes, and
 * `MatchHistoryResponseView` is a plain formatter, not a push-based `View`.
 */
export class MatchHistoryController extends AbstractController {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly responseView: MatchHistoryResponseView = new MatchHistoryResponseView(),
    private readonly errorView: ErrorResponseView = new ErrorResponseView(),
  ) {
    super(NULL_MODEL, NULL_VIEW);
  }

  /**
   * Fetches a page of match history via `MatchRepository.findHistoryForPlayer` and formats it through
   * `MatchHistoryResponseView`. Catches any `ArenaError` and formats it via `ErrorResponseView` instead of
   * letting it propagate — same controller-catches/view-shows pattern as `InternalMatchController`
   * (`10_api_1`).
   * @param req - Express request carrying the player id and pagination params
   * @param res - Express response, written to directly rather than returned
   */
  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const playerId = req.params.id as PlayerId;
      const { page, pageSize } = this.parsePagination(req.query.page, req.query.pageSize);
      const rows = await this.matchRepository.findHistoryForPlayer(playerId, page, pageSize);
      res.status(200).json(this.responseView.render(rows));
    } catch (err) {
      this.respondError(err, res);
    }
  }

  private parsePagination(rawPage: unknown, rawPageSize: unknown): { page: number; pageSize: number } {
    const page = this.parsePositiveInt(rawPage, 'page');
    const pageSize = this.parsePositiveInt(rawPageSize, 'pageSize');
    return { page, pageSize };
  }

  private parsePositiveInt(raw: unknown, field: string): number {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new ValidationError(field, 'must be provided');
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new ValidationError(field, 'must be a positive integer');
    }
    return value;
  }

  private respondError(err: unknown, res: Response): void {
    if (err instanceof ArenaError) {
      const { status, body } = this.errorView.render(err);
      res.status(status).json(body);
      return;
    }
    throw err;
  }

  /**
   * Satisfies the `AbstractController` contract; unused in this controller's own request path, since the
   * Express route calls `getHistory` directly rather than dispatching through `operation`.
   * @param action - unused
   * @param payload - unused
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchHistoryController.operation not yet implemented');
  }
}
```

### 4. Create `packages/api/src/controller/MatchHistoryController.test.ts` with:

```ts
import { MatchResult, EndReason } from '@arena/shared';
import type { Request, Response } from 'express';
import { MatchHistoryController } from './MatchHistoryController';
import { MatchRepository, MatchHistoryRow } from '../model/MatchRepository';

function makeRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeReq(params: Record<string, string>, query: Record<string, unknown>): Request {
  return { params, query } as unknown as Request;
}

function makeRepo(overrides: Partial<MatchRepository> = {}): MatchRepository {
  return {
    recordMatch: jest.fn(),
    findHistoryForPlayer: jest.fn(async () => [] as MatchHistoryRow[]),
    ...overrides,
  } as unknown as MatchRepository;
}

const SAMPLE_ROW: MatchHistoryRow = {
  matchId: 'match-1',
  opponentUsername: 'Bob',
  championId: 'korr',
  result: MatchResult.WIN,
  endReason: EndReason.ELIMINATION,
  durationMs: 90_000,
  endedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('MatchHistoryController', () => {
  describe('getHistory', () => {
    it('parses page/pageSize, delegates to MatchRepository, and formats via the response view', async () => {
      const repo = makeRepo({ findHistoryForPlayer: jest.fn(async () => [SAMPLE_ROW]) });
      const controller = new MatchHistoryController(repo);
      const res = makeRes();

      await controller.getHistory(makeReq({ id: 'p1' }, { page: '2', pageSize: '10' }), res);

      expect(repo.findHistoryForPlayer).toHaveBeenCalledWith('p1', 2, 10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({ matchId: 'match-1', opponentUsername: 'Bob', endedAt: '2026-01-01T00:00:00.000Z' }),
      ]);
    });

    it('responds 200 with an empty array for a player with no history', async () => {
      const repo = makeRepo();
      const controller = new MatchHistoryController(repo);
      const res = makeRes();

      await controller.getHistory(makeReq({ id: 'p1' }, { page: '1', pageSize: '10' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('responds 400 when page is missing', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { pageSize: '10' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('responds 400 when pageSize is missing', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { page: '1' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when page is not a positive integer', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { page: '0', pageSize: '10' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when page is not numeric', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { page: 'abc', pageSize: '10' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when pageSize is not a positive integer', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { page: '1', pageSize: '-5' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rethrows a non-ArenaError from the repository uncaught', async () => {
      const repo = makeRepo({
        findHistoryForPlayer: jest.fn(async () => {
          throw new Error('unexpected');
        }),
      });
      const controller = new MatchHistoryController(repo);
      await expect(controller.getHistory(makeReq({ id: 'p1' }, { page: '1', pageSize: '10' }), makeRes())).rejects.toThrow(
        'unexpected',
      );
    });
  });

  describe('operation', () => {
    it('throws NotImplementedError — unused, the Express route calls getHistory directly', () => {
      const controller = new MatchHistoryController(makeRepo());
      expect(() => controller.operation('anything')).toThrow('not yet implemented');
    });
  });
});
```

---

### 5. Verification and Git
Per master context §9.5/§9.4: `npm run test:db:up` first, then `npm run typecheck -w @arena/api` passes;
`npx jest MatchRepository --coverage --collectCoverageFrom="src/model/MatchRepository.ts"` (real Postgres
integration test) — validated result: **5 tests passing, 100% statement/branch/function/line coverage**,
including the corrected `findHistoryForPlayer` join; `npx jest MatchHistoryResponseView --coverage
--collectCoverageFrom="src/view/MatchHistoryResponseView.ts"` — validated result: **3 tests passing, 100%
coverage**; `npx jest MatchHistoryController --coverage
--collectCoverageFrom="src/controller/MatchHistoryController.ts"` — validated result: **9 tests passing,
100% coverage**. Also re-run the full `packages/api` suite once (`npx jest`) to confirm no regression from
the `MatchRepository` correction — validated result: **8 suites, 39 tests, all passing**. Branch `api` from
`main` (or reuse an already-checked-out `api` branch), commit `Step 10: MatchHistoryController and
MatchHistoryResponseView implementation and tests, MatchRepository opponent-join correction`, push, open a
PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `MatchRepository.findHistoryForPlayer` now returns `MatchHistoryRow[]`, not
`MatchParticipant[]` — do not revert that signature "to match the original stub" when transcribing this
prompt.** The stub's original signature was simply incomplete for R7.3's actual wire shape; the corrected
signature above is the real, validated one.
