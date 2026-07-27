# Prompt 09_api_4 — MatchRepository + LeaderboardEntry.fromRow Implementation

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` (§3, database
testing approach) first. This prompt's code below is already validated (implemented and test-run against a
real `postgres:16` container, then reverted to the stub so the actual commit happens through your own
branch/PR flow) — you are transcribing proven work, not designing from scratch. Still run everything
yourself; don't skip verification.

### MANDATORY: fetch before you branch
`server`, `client`, and `shared` tracks push to `main` concurrently and independently, and three other
`api` prompts (`09_api_1`, `09_api_3`, `09_api_5`) exist in this batch — do not assume your local `main`
matches `origin/main`. Before doing anything else:
```
git fetch origin
git checkout main && git pull origin main
```
Then confirm the prerequisite below is actually present on your now-current `main`, not just remembered
from an earlier session.

### CRITICAL prerequisite
**`09_api_2_schema-and-pgpool.md` must already be merged to `main`.** Check with
`ls packages/api/schema.sql` after the pull above — if it's missing, stop and wait for that PR to merge.
This prompt also builds on `09_api_3`'s `PlayerRepository` only indirectly (its tests insert `players` rows
directly via `PgPool`, not through `PlayerRepository`, so `09_api_3` does not block starting this one — but
it does share the same schema and test database).

### CRITICAL real gap found during implementation: `PgPool` had no transaction support
`MatchRepository.recordMatch` must write one `matches` row and exactly two `match_participants` rows as a
single atomic unit (R7.1, R-DB2, R-DB4 — "cannot exist without both a match and a player", and a partial
write would leave an orphaned or incomplete match record). `PgPool.query` alone cannot guarantee this: the
underlying `pg.Pool` may hand a different pooled connection to each call, so three separate `query()` calls
are three separate implicit auto-commit transactions, not one. Rather than work around this with non-atomic
separate inserts (explicitly disallowed by this prompt's own closing requirement), **`PgPool` gains a new
`transaction<T>()` method** — the same kind of stub-exceeding addition `09_api_2` made for `close()`. Both
`PgPool.ts` and `docs/01_class_list.md`'s `PgPool` row are updated below; do not skip the doc update.

---

### 1. Add `transaction<T>()` to `packages/api/src/util/PgPool.ts`

Insert this method into the existing `PgPool` class (after `query`, before `close`):

```ts
  /**
   * Runs a series of queries as a single atomic transaction on one pooled connection: `BEGIN`, then `fn`
   * with a `query` function scoped to that connection, then `COMMIT` on success or `ROLLBACK` on failure.
   * Needed by `MatchRepository.recordMatch` (one `matches` row plus two `match_participants` rows must
   * commit or fail together, R-DB4) — `PgPool.query` alone can't guarantee that, since the pool may hand
   * out a different connection per call.
   * @param fn - receives a `query` function bound to the transaction's connection; its return value is
   *   this method's return value once the transaction commits
   * @returns whatever `fn` returns
   * @throws {PersistenceError} if `fn` throws, or if `BEGIN`/`COMMIT`/the query itself fails — the
   *   transaction is rolled back first in either case
   */
  async transaction<T>(fn: (query: <R>(sql: string, params: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const scopedQuery = async <R>(sql: string, params: unknown[]): Promise<R[]> => {
        const result = await client.query(sql, params);
        return result.rows as R[];
      };
      const result = await fn(scopedQuery);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new PersistenceError('transaction', err);
    } finally {
      client.release();
    }
  }
```

No new imports needed — `PersistenceError` is already imported for `query()`.

### 2. Add transaction tests to `packages/api/src/util/PgPool.test.ts`

Append this `describe` block inside the existing top-level `describe('PgPool (integration — real
PostgreSQL)', ...)`:

```ts
  describe('transaction', () => {
    afterEach(async () => {
      await pool.query('DELETE FROM players WHERE id = $1', ['test-txn-player']);
    });

    it('commits all queries together when fn succeeds', async () => {
      const result = await pool.transaction(async (query) => {
        await query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-txn-player', 'TxnCommitTest']);
        return query<{ username: string }>('SELECT username FROM players WHERE id = $1', ['test-txn-player']);
      });
      expect(result).toEqual([{ username: 'TxnCommitTest' }]);

      const rows = await pool.query('SELECT id FROM players WHERE id = $1', ['test-txn-player']);
      expect(rows).toHaveLength(1);
    });

    it('rolls back every query in the transaction when fn throws partway through', async () => {
      await expect(
        pool.transaction(async (query) => {
          await query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-txn-player', 'TxnRollbackTest']);
          throw new Error('simulated failure after the insert');
        }),
      ).rejects.toThrow(PersistenceError);

      const rows = await pool.query('SELECT id FROM players WHERE id = $1', ['test-txn-player']);
      expect(rows).toHaveLength(0); // the insert above must not have survived the rollback
    });

    it('rolls back when a query inside the transaction violates a constraint', async () => {
      await expect(
        pool.transaction(async (query) => {
          await query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-txn-player', 'TxnConstraintTest']);
          await query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-txn-player-dup', 'TxnConstraintTest']); // duplicate username
        }),
      ).rejects.toThrow(PersistenceError);

      const rows = await pool.query('SELECT id FROM players WHERE id = $1', ['test-txn-player']);
      expect(rows).toHaveLength(0);
    });
  });
```

### 3. Update `docs/01_class_list.md`'s `PgPool` row
Change the row (currently):
```
| `PgPool` | `constructor(connectionString: string)`; `query<T>(sql: string, params: unknown[]): Promise<T[]>` — **throws** `PersistenceError`; `close(): Promise<void>` — releases all pooled connections (process shutdown, test teardown) |
```
to:
```
| `PgPool` | `constructor(connectionString: string)`; `query<T>(sql: string, params: unknown[]): Promise<T[]>` — **throws** `PersistenceError`; `transaction<T>(fn: (query) => Promise<T>): Promise<T>` — runs `fn` atomically over one pooled connection (`BEGIN`/`COMMIT`/`ROLLBACK`) — **throws** `PersistenceError`; `close(): Promise<void>` — releases all pooled connections (process shutdown, test teardown) |
```
and add a row-note below the table: "**Step 9 addition**: `transaction<T>()` was added during
`MatchRepository` implementation — `recordMatch` needs one `matches` row and two `match_participants` rows
to commit or fail together (R-DB4), which plain `query()` calls against a connection pool cannot guarantee."

---

### 4. Replace `packages/api/src/model/MatchRepository.ts` with:

```ts
import { Match, MatchParticipant, PlayerId, Team, MatchResult } from '@arena/shared';
import { PgPool } from '../util/PgPool';

interface MatchParticipantRow {
  match_id: string;
  player_id: string;
  team: string;
  champion_id: string;
  result: string;
}

function toMatchParticipant(row: MatchParticipantRow): MatchParticipant {
  return new MatchParticipant(row.match_id, row.player_id, row.team as Team, row.champion_id, row.result as MatchResult);
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
   * @param playerId - the player whose history to fetch
   * @param page - 1-indexed page number
   * @param pageSize - number of entries per page
   * @returns the page of `MatchParticipant` rows for that player
   * @throws {PersistenceError} if the underlying query fails
   */
  async findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchParticipant[]> {
    const offset = (page - 1) * pageSize;
    const rows = await this.pool.query<MatchParticipantRow>(
      `SELECT mp.match_id, mp.player_id, mp.team, mp.champion_id, mp.result
       FROM match_participants mp
       JOIN matches m ON m.id = mp.match_id
       WHERE mp.player_id = $1
       ORDER BY m.ended_at DESC
       LIMIT $2 OFFSET $3`,
      [playerId, pageSize, offset],
    );
    return rows.map(toMatchParticipant);
  }
}
```

**Design note — `page` is 1-indexed**: `docs/01_class_list.md` left this "fixed by the implementation".
Page 1 returns the most recent `pageSize` matches; `OFFSET = (page - 1) * pageSize`. Document this choice
wherever the REST layer (`MatchHistoryController`, Step 10) accepts a `page` query parameter, so the two
ends agree without a docs mismatch.

### 5. Replace `packages/api/src/model/LeaderboardEntry.ts`'s `fromRow` method with:

Keep the constructor and class doc comment as-is; only replace the `fromRow` static method body:

```ts
  /**
   * Builds a `LeaderboardEntry` from one aggregated query result row. Expects the row to carry the
   * columns `player_id`, `username`, `wins`, `losses`, `draws`, `games_played`, `win_rate` — the aliases
   * `LeaderboardRepository.computeLeaderboard`'s query produces (`pg` returns `COUNT`/`SUM` aggregates as
   * strings, hence the `Number(...)` conversions below).
   * @param row - a raw row returned by `LeaderboardRepository.computeLeaderboard`'s query
   * @returns the corresponding `LeaderboardEntry`
   */
  static fromRow(row: Record<string, unknown>): LeaderboardEntry {
    return new LeaderboardEntry(
      row.player_id as PlayerId,
      row.username as string,
      Number(row.wins),
      Number(row.losses),
      Number(row.draws),
      Number(row.games_played),
      Number(row.win_rate),
    );
  }
```
Also delete the now-unused `NotImplementedError` import from that file's import list (keep the `PlayerId`
import).

### 6. Create `packages/api/src/model/LeaderboardEntry.test.ts` with:

```ts
import { LeaderboardEntry } from './LeaderboardEntry';

describe('LeaderboardEntry.fromRow', () => {
  it('maps a raw aggregated row (pg-driver string numerics) into a typed entry', () => {
    const entry = LeaderboardEntry.fromRow({
      player_id: 'player-1',
      username: 'Ada',
      wins: '3',
      losses: '1',
      draws: '0',
      games_played: '4',
      win_rate: '0.75',
    });

    expect(entry).toBeInstanceOf(LeaderboardEntry);
    expect(entry.playerId).toBe('player-1');
    expect(entry.username).toBe('Ada');
    expect(entry.wins).toBe(3);
    expect(entry.losses).toBe(1);
    expect(entry.draws).toBe(0);
    expect(entry.gamesPlayed).toBe(4);
    expect(entry.winRate).toBe(0.75);
  });

  it('also accepts already-numeric fields', () => {
    const entry = LeaderboardEntry.fromRow({
      player_id: 'player-2',
      username: 'Bea',
      wins: 0,
      losses: 0,
      draws: 2,
      games_played: 2,
      win_rate: 0,
    });

    expect(entry.wins).toBe(0);
    expect(entry.draws).toBe(2);
    expect(entry.winRate).toBe(0);
  });
});
```

### 7. Create `packages/api/src/model/MatchRepository.test.ts` with:

```ts
import { Match, MatchParticipant, Team, EndReason, MatchResult } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { MatchRepository } from './MatchRepository';

// Requires `npm run test:db:up` first -- packages/api/schema.sql is applied automatically via Postgres's
// init-scripts mechanism when the container first starts.
const TEST_CONNECTION_STRING = 'postgresql://arena:arena@localhost:55432/arena_test';

const PLAYER_A = 'match-repo-test-player-a';
const PLAYER_B = 'match-repo-test-player-b';

describe('MatchRepository (integration — real PostgreSQL)', () => {
  let pool: PgPool;
  let repo: MatchRepository;

  beforeAll(async () => {
    pool = new PgPool(TEST_CONNECTION_STRING);
    repo = new MatchRepository(pool);
    await pool.query('INSERT INTO players (id, username) VALUES ($1, $2), ($3, $4)', [
      PLAYER_A,
      'MatchRepoTestPlayerA',
      PLAYER_B,
      'MatchRepoTestPlayerB',
    ]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM match_participants WHERE player_id = ANY($1)', [[PLAYER_A, PLAYER_B]]);
    await pool.query('DELETE FROM matches WHERE id LIKE $1', ['match-repo-test-%']);
    await pool.query('DELETE FROM players WHERE id = ANY($1)', [[PLAYER_A, PLAYER_B]]);
    await pool.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM match_participants WHERE player_id = ANY($1)', [[PLAYER_A, PLAYER_B]]);
    await pool.query('DELETE FROM matches WHERE id LIKE $1', ['match-repo-test-%']);
  });

  function makeMatch(id: string, endedAt: Date): Match {
    return new Match(id, EndReason.ELIMINATION, Team.A, 90_000, endedAt);
  }

  function makeParticipants(matchId: string): MatchParticipant[] {
    return [
      new MatchParticipant(matchId, PLAYER_A, Team.A, 'korr', MatchResult.WIN),
      new MatchParticipant(matchId, PLAYER_B, Team.B, 'vex', MatchResult.LOSS),
    ];
  }

  describe('recordMatch', () => {
    it('writes one matches row and exactly two match_participants rows', async () => {
      const matchId = 'match-repo-test-1';
      await repo.recordMatch(makeMatch(matchId, new Date('2026-01-01T00:00:00Z')), makeParticipants(matchId));

      const matchRows = await pool.query('SELECT id, winning_team, end_reason FROM matches WHERE id = $1', [matchId]);
      expect(matchRows).toHaveLength(1);
      expect(matchRows[0]).toMatchObject({ id: matchId, winning_team: 'A', end_reason: 'ELIMINATION' });

      const participantRows = await pool.query('SELECT player_id, result FROM match_participants WHERE match_id = $1', [
        matchId,
      ]);
      expect(participantRows).toHaveLength(2);
    });

    it('persists a draw (null winningTeam) correctly', async () => {
      const matchId = 'match-repo-test-draw';
      const draw = new Match(matchId, EndReason.TIME_LIMIT, null, 300_000, new Date());
      await repo.recordMatch(draw, makeParticipants(matchId));

      const rows = await pool.query<{ winning_team: string | null }>('SELECT winning_team FROM matches WHERE id = $1', [
        matchId,
      ]);
      expect(rows[0].winning_team).toBeNull();
    });

    it('CRITICAL: rolls back the match row too when a participant insert fails (atomic write, R-DB4)', async () => {
      const matchId = 'match-repo-test-atomic';
      const badParticipants = [
        new MatchParticipant(matchId, PLAYER_A, Team.A, 'korr', MatchResult.WIN),
        new MatchParticipant(matchId, 'no-such-player', Team.B, 'vex', MatchResult.LOSS), // FK violation
      ];

      await expect(repo.recordMatch(makeMatch(matchId, new Date()), badParticipants)).rejects.toThrow();

      const matchRows = await pool.query('SELECT id FROM matches WHERE id = $1', [matchId]);
      expect(matchRows).toHaveLength(0); // the matches insert must not have survived the rollback
    });
  });

  describe('findHistoryForPlayer', () => {
    it('returns matches most-recent-first, paginated', async () => {
      const ids = ['match-repo-test-h1', 'match-repo-test-h2', 'match-repo-test-h3'];
      const dates = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z'), new Date('2026-01-03T00:00:00Z')];
      for (let i = 0; i < ids.length; i++) {
        await repo.recordMatch(makeMatch(ids[i], dates[i]), makeParticipants(ids[i]));
      }

      const page1 = await repo.findHistoryForPlayer(PLAYER_A, 1, 2);
      expect(page1.map((p) => p.matchId)).toEqual(['match-repo-test-h3', 'match-repo-test-h2']);

      const page2 = await repo.findHistoryForPlayer(PLAYER_A, 2, 2);
      expect(page2.map((p) => p.matchId)).toEqual(['match-repo-test-h1']);
    });

    it('returns an empty array for a player with no match history', async () => {
      const history = await repo.findHistoryForPlayer('nobody-has-played-me', 1, 10);
      expect(history).toEqual([]);
    });
  });
});
```

---

### 8. Verification and Git
```
npm run test:db:up
# wait for it to be ready: docker exec <container> pg_isready -U arena (retry a few times)
npm run typecheck -w @arena/api
npx jest PgPool --coverage --collectCoverageFrom="src/util/PgPool.ts"
npx jest MatchRepository LeaderboardEntry --coverage --collectCoverageFrom="src/model/MatchRepository.ts" --collectCoverageFrom="src/model/LeaderboardEntry.ts"
npm run test:db:down
```
Validated result: `PgPool.ts` 7/7 tests passing (4 pre-existing + 3 new transaction tests), 100%
statement/branch/function/line coverage. `MatchRepository.ts` and `LeaderboardEntry.ts` combined: 7/7 tests
passing, 100% coverage on both files, including the named atomic-write rollback test. Per master context
§9.4:
```
git fetch origin
git checkout main && git pull origin main
git checkout api 2>/dev/null && git merge main || git checkout -b api main
```
(the first branch of the `||` picks up an `api` branch already in flight from another prompt in this
batch and fast-forwards it onto the latest `main`; the second creates it fresh if none exists yet). Commit
`Step 9: PgPool transaction support, MatchRepository, and LeaderboardEntry.fromRow`, push. If
`git push origin api` is rejected because the remote moved while you worked, `git fetch origin && git
rebase origin/api` (resolve conflicts, don't force-push) before retrying. Open a PR into `main` (or fold
into an existing in-flight `api`-branch PR alongside the other three prompts in this batch). Note in the
PR/commit body that `docs/01_class_list.md`'s `PgPool` row was updated for the `transaction<T>()` addition.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `09_api_5` (`LeaderboardRepository`) depends on `LeaderboardEntry.fromRow`'s exact column-name
contract (`player_id`, `username`, `wins`, `losses`, `draws`, `games_played`, `win_rate`) established here —
its aggregation query must alias its output columns to match exactly, or `fromRow` will silently produce
`NaN` fields instead of throwing (a bare `Record<string, unknown>` gives no compile-time protection here).**
