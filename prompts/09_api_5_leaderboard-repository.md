# Prompt 09_api_5 — LeaderboardRepository Implementation

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` (§3, database
testing approach) first. This prompt's code below is already validated (implemented and test-run against a
real `postgres:16` container, then reverted to the stub so the actual commit happens through your own
branch/PR flow) — you are transcribing proven work, not designing from scratch. Still run everything
yourself; don't skip verification.

### MANDATORY: fetch before you branch
`server`, `client`, and `shared` tracks push to `main` concurrently and independently, and three other
`api` prompts (`09_api_1`, `09_api_3`, `09_api_4`) exist in this batch — do not assume your local `main`
matches `origin/main`. Before doing anything else:
```
git fetch origin
git checkout main && git pull origin main
```
Then confirm the prerequisites below are actually present on your now-current `main`, not just remembered
from an earlier session.

### CRITICAL prerequisites
**`09_api_2_schema-and-pgpool.md` must already be merged to `main`** — check with
`ls packages/api/schema.sql` after the pull above. This prompt also depends on
**`09_api_4_match-repository.md`** — not for any code it imports, but because this prompt's own tests use
`MatchRepository.recordMatch` to seed realistic match history fixtures, and because it depends on
`LeaderboardEntry.fromRow`'s column-name contract (`player_id`, `username`, `wins`, `losses`, `draws`,
`games_played`, `win_rate`) that `09_api_4` established. Confirm `LeaderboardEntry.fromRow` is implemented
(not throwing `NotImplementedError`) — open `packages/api/src/model/LeaderboardEntry.ts` on your
just-updated `main` and check — before starting.

### R8.1 — win rate is computed by the query, not maintained separately
`docs/01_class_list.md` and the current stub's doc comment both call this out: win rate must be derived
fresh from match history at query time (`wins / gamesPlayed`), never stored as an incrementally-updated
counter. Both queries below compute it inline via `COUNT(*) FILTER (WHERE ...)`.

---

### 1. Replace `packages/api/src/model/LeaderboardRepository.ts` with:

```ts
import { ChampionWinRateDTO } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { LeaderboardEntry } from './LeaderboardEntry';

interface ChampionWinRateRow {
  champion_id: string;
  games_played: string;
  win_rate: string;
}

/** Computes leaderboard standings and per-champion win rates from recorded match history (R8.1–R8.3). */
export class LeaderboardRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Computes each qualifying player's win rate. Win rate is always derived fresh from match history at
   * query time — wins / gamesPlayed, computed by the query itself via `FILTER`/`COUNT`, not as a
   * separately maintained value (R8.1); this is a correctness property, not an implementation detail, so
   * it should not be "optimized" into an incrementally updated counter later. Players below `minGames`
   * are excluded via `HAVING`, not filtered client-side (R8.2). Ordered by win rate, then total wins,
   * descending.
   * @param minGames - minimum games played to qualify for inclusion (R8.2, default 1 — see
   *   `prompts/00_master_context.md` §4.1)
   * @returns qualifying players' leaderboard entries
   * @throws {PersistenceError} if the underlying query fails
   */
  async computeLeaderboard(minGames: number): Promise<LeaderboardEntry[]> {
    const rows = await this.pool.query<Record<string, unknown>>(
      `SELECT
         mp.player_id AS player_id,
         p.username AS username,
         COUNT(*) FILTER (WHERE mp.result = 'WIN') AS wins,
         COUNT(*) FILTER (WHERE mp.result = 'LOSS') AS losses,
         COUNT(*) FILTER (WHERE mp.result = 'DRAW') AS draws,
         COUNT(*) AS games_played,
         (COUNT(*) FILTER (WHERE mp.result = 'WIN'))::float / COUNT(*) AS win_rate
       FROM match_participants mp
       JOIN players p ON p.id = mp.player_id
       GROUP BY mp.player_id, p.username
       HAVING COUNT(*) >= $1
       ORDER BY win_rate DESC, wins DESC`,
      [minGames],
    );
    return rows.map((row) => LeaderboardEntry.fromRow(row));
  }

  /**
   * Computes each champion's aggregate win rate across all recorded matches (R8.3), the same
   * computed-at-query-time way as `computeLeaderboard` (R8.1's correctness property applies equally here).
   * @returns one win-rate summary per champion
   * @throws {PersistenceError} if the underlying query fails
   */
  async computeChampionWinRates(): Promise<ChampionWinRateDTO[]> {
    const rows = await this.pool.query<ChampionWinRateRow>(
      `SELECT
         champion_id AS champion_id,
         COUNT(*) AS games_played,
         (COUNT(*) FILTER (WHERE result = 'WIN'))::float / COUNT(*) AS win_rate
       FROM match_participants
       GROUP BY champion_id
       ORDER BY win_rate DESC`,
      [],
    );
    return rows.map((row) => ({
      championId: row.champion_id,
      gamesPlayed: Number(row.games_played),
      winRate: Number(row.win_rate),
    }));
  }
}
```

**Why `HAVING` and not a `WHERE` on a subquery**: `HAVING COUNT(*) >= $1` filters on the aggregate itself,
computed in the same pass as `wins`/`losses`/`games_played` — no second pass over `match_participants` is
needed. **Why `::float` and not leaving the division as integer**: Postgres integer division truncates
(`2 / 3` = `0`, not `0.666...`); casting the numerator to `float` first forces real division.

### 2. Create `packages/api/src/model/LeaderboardRepository.test.ts` with:

```ts
import { Match, MatchParticipant, Team, EndReason, MatchResult } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { MatchRepository } from './MatchRepository';
import { LeaderboardRepository } from './LeaderboardRepository';

// Requires `npm run test:db:up` first -- packages/api/schema.sql is applied automatically via Postgres's
// init-scripts mechanism when the container first starts.
const TEST_CONNECTION_STRING = 'postgresql://arena:arena@localhost:55432/arena_test';

const PLAYER_HIGH_WINRATE = 'leaderboard-test-player-high';
const PLAYER_LOW_GAMES = 'leaderboard-test-player-low-games';
const PLAYER_OPPONENT = 'leaderboard-test-player-opponent';

describe('LeaderboardRepository (integration — real PostgreSQL)', () => {
  let pool: PgPool;
  let matchRepo: MatchRepository;
  let leaderboardRepo: LeaderboardRepository;

  async function cleanup(): Promise<void> {
    const players = [PLAYER_HIGH_WINRATE, PLAYER_LOW_GAMES, PLAYER_OPPONENT];
    await pool.query('DELETE FROM match_participants WHERE player_id = ANY($1)', [players]);
    await pool.query('DELETE FROM matches WHERE id LIKE $1', ['leaderboard-test-%']);
    await pool.query('DELETE FROM players WHERE id = ANY($1)', [players]);
  }

  beforeAll(async () => {
    pool = new PgPool(TEST_CONNECTION_STRING);
    matchRepo = new MatchRepository(pool);
    leaderboardRepo = new LeaderboardRepository(pool);
    await cleanup();
    await pool.query('INSERT INTO players (id, username) VALUES ($1, $2), ($3, $4), ($5, $6)', [
      PLAYER_HIGH_WINRATE,
      'LeaderboardTestHigh',
      PLAYER_LOW_GAMES,
      'LeaderboardTestLowGames',
      PLAYER_OPPONENT,
      'LeaderboardTestOpponent',
    ]);

    // PLAYER_HIGH_WINRATE: 3 games, 2 wins, 1 loss -> winRate 2/3
    for (let i = 0; i < 3; i++) {
      const matchId = `leaderboard-test-high-${i}`;
      await matchRepo.recordMatch(new Match(matchId, EndReason.ELIMINATION, Team.A, 60_000, new Date()), [
        new MatchParticipant(matchId, PLAYER_HIGH_WINRATE, Team.A, 'korr', i < 2 ? MatchResult.WIN : MatchResult.LOSS),
        new MatchParticipant(matchId, PLAYER_OPPONENT, Team.B, 'vex', i < 2 ? MatchResult.LOSS : MatchResult.WIN),
      ]);
    }

    // PLAYER_LOW_GAMES: 1 game, 1 win -> winRate 1/1, but below the minGames=2 threshold used in tests
    const lowGamesMatchId = 'leaderboard-test-lowgames-0';
    await matchRepo.recordMatch(new Match(lowGamesMatchId, EndReason.ELIMINATION, Team.A, 60_000, new Date()), [
      new MatchParticipant(lowGamesMatchId, PLAYER_LOW_GAMES, Team.A, 'rin', MatchResult.WIN),
      new MatchParticipant(lowGamesMatchId, PLAYER_OPPONENT, Team.B, 'vex', MatchResult.LOSS),
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.close();
  });

  describe('computeLeaderboard', () => {
    it('computes wins/losses/gamesPlayed/winRate per player, ordered by win rate descending', async () => {
      const entries = await leaderboardRepo.computeLeaderboard(1);
      const high = entries.find((e) => e.playerId === PLAYER_HIGH_WINRATE)!;
      expect(high.wins).toBe(2);
      expect(high.losses).toBe(1);
      expect(high.draws).toBe(0);
      expect(high.gamesPlayed).toBe(3);
      expect(high.winRate).toBeCloseTo(2 / 3, 5);
    });

    it('R8.2: excludes players below minGames', async () => {
      const withLowThreshold = await leaderboardRepo.computeLeaderboard(1);
      expect(withLowThreshold.some((e) => e.playerId === PLAYER_LOW_GAMES)).toBe(true);

      const withHigherThreshold = await leaderboardRepo.computeLeaderboard(2);
      expect(withHigherThreshold.some((e) => e.playerId === PLAYER_LOW_GAMES)).toBe(false);
      expect(withHigherThreshold.some((e) => e.playerId === PLAYER_HIGH_WINRATE)).toBe(true);
    });
  });

  describe('computeChampionWinRates', () => {
    it('aggregates win rate per champion across all recorded matches', async () => {
      const rates = await leaderboardRepo.computeChampionWinRates();
      const korr = rates.find((r) => r.championId === 'korr')!;
      expect(korr.gamesPlayed).toBe(3);
      expect(korr.winRate).toBeCloseTo(2 / 3, 5);

      const rin = rates.find((r) => r.championId === 'rin')!;
      expect(rin.gamesPlayed).toBe(1);
      expect(rin.winRate).toBe(1);
    });
  });
});
```

---

### 3. Verification and Git
```
npm run test:db:up
# wait for it to be ready: docker exec <container> pg_isready -U arena (retry a few times)
npm run typecheck -w @arena/api
npx jest LeaderboardRepository --coverage --collectCoverageFrom="src/model/LeaderboardRepository.ts"
npm run test:db:down
```
Validated result: 3/3 tests passing, 100% statement/branch/function/line coverage on
`LeaderboardRepository.ts`, including the R8.2 `minGames` exclusion boundary. After this prompt, run the
**full api suite together** as a final sanity check before committing:
```
npm run test:db:up
npx jest --coverage -w @arena/api   # or from packages/api directly
npm run test:db:down
```
Validated result across all six model/util files (`PendingMatchCorrelator`, `PlayerRepository`,
`MatchRepository`, `LeaderboardEntry`, `LeaderboardRepository`, `PgPool`): 27/27 tests passing, 100%
statement/branch/function/line coverage on every file. Per master context §9.4:
```
git fetch origin
git checkout main && git pull origin main
git checkout api 2>/dev/null && git merge main || git checkout -b api main
```
(the first branch of the `||` picks up an `api` branch already in flight from another prompt in this
batch and fast-forwards it onto the latest `main`; the second creates it fresh if none exists yet). Since
this is the last prompt in the batch, resolve any conflicts here rather than deferring them. Commit
`Step 9: LeaderboardRepository implementation and tests — api model package complete`, push. If
`git push origin api` is rejected because the remote moved while you worked, `git fetch origin && git
rebase origin/api` (resolve conflicts, don't force-push) before retrying. Open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this is the last of the four `09_api_*` model prompts (`09_api_1`, `09_api_3`, `09_api_4`,
`09_api_5`) — once this PR merges, `packages/api`'s model package is complete and Step 10's api-track
prompts (`InternalMatchController`, `MatchHistoryController`, `LeaderboardController`, `ApiMain`) can begin,
per `prompts/09-10_implementation_plan.md` §1's "model package first, per track" rule.**
