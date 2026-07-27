# Prompt 10_api_4 — ApiMain Implementation

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first. This
prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisites
1. `packages/api`'s entire model package (`09_api_1` through `09_api_5`) must already be merged to `main`.
2. **`10_api_1`, `10_api_2`, and `10_api_3` must all be merged first** — `ApiMain` constructs and wires all
   three controllers (`InternalMatchController`, `MatchHistoryController`, `LeaderboardController`) those
   prompts implement, plus `PlayerRepository` (needed by `InternalMatchController` per `10_api_1`'s CRITICAL
   correction — see that prompt if you haven't read it yet).

---

### Design note: scope, per the implementation plan
Per `prompts/09-10_implementation_plan.md`'s Step 10 table, `ApiMain.main()`'s scope is "wiring, smoke
test — don't over-engineer this one." This prompt does exactly that: build the Express app, wire the three
controllers to their routes, connect `PgPool`, listen. It adds one small test-only extra beyond
`docs/01_class_list.md`'s literal `main(): Promise<void>` signature — a `stop()` method — solely so a smoke
test can shut down the server and connection pool it started, rather than leaking an open port and pooled
connections across test runs. `stop()` is not part of the class list and carries no game logic.

`PORT` and `DATABASE_URL` are read from the environment, falling back to reasonable local-dev defaults —
per R-D7 (Portability), nothing here may depend on a Railway-specific feature, and plain env vars are
supported by any container runtime (Docker, Railway, or a bare `docker run`).

The internal `/internal/matches/*` routes and the public routes are registered on the same `app` with no
network-level separation — see `10_api_1`'s deployment note: restricting real access to the internal routes
is documented there as a deployment concern, not something any `packages/api` code enforces.

---

### 1. Replace `packages/api/src/ApiMain.ts` with:

```ts
import express from 'express';
import type { Server } from 'http';
import { PgPool } from './util/PgPool';
import { PendingMatchCorrelator } from './model/PendingMatchCorrelator';
import { PlayerRepository } from './model/PlayerRepository';
import { MatchRepository } from './model/MatchRepository';
import { LeaderboardRepository } from './model/LeaderboardRepository';
import { InternalMatchController } from './controller/InternalMatchController';
import { MatchHistoryController } from './controller/MatchHistoryController';
import { LeaderboardController } from './controller/LeaderboardController';

/** Entry point for the `packages/api` subsystem (R-D4 — builds and runs as an independent container). */
export class ApiMain {
  /** Set once `main()` starts listening; lets `stop()` shut the same server back down for tests. */
  private static server: Server | null = null;
  /** Set once `main()` connects; lets `stop()` release pooled connections back down for tests. */
  private static pool: PgPool | null = null;

  /**
   * Builds the Express app, wires middleware and the three controllers to routes, connects `PgPool`, and
   * listens on the configured port. `PORT` and `DATABASE_URL` are read from the environment (R-D7 —
   * nothing here may depend on a Railway-specific feature; both are plain env vars any container runtime
   * supplies), falling back to reasonable local-dev defaults if unset.
   */
  static async main(): Promise<void> {
    const port = Number(process.env.PORT ?? 4000);
    const connectionString = process.env.DATABASE_URL ?? 'postgresql://arena:arena@localhost:5432/arena';

    const pool = new PgPool(connectionString);
    ApiMain.pool = pool;
    const correlator = new PendingMatchCorrelator();
    const playerRepository = new PlayerRepository(pool);
    const matchRepository = new MatchRepository(pool);
    const leaderboardRepository = new LeaderboardRepository(pool);

    const internalMatchController = new InternalMatchController(correlator, matchRepository, playerRepository);
    const matchHistoryController = new MatchHistoryController(matchRepository);
    const leaderboardController = new LeaderboardController(leaderboardRepository);

    const app = express();
    app.use(express.json());

    // Internal, server-to-api routes — not exposed to players. See InternalMatchController's deployment
    // note: restricting real network access to these two routes is a deployment concern, not enforced here.
    app.post('/internal/matches/begin', (req, res) => {
      void internalMatchController.handleBegin(req, res);
    });
    app.post('/internal/matches/end', (req, res) => {
      void internalMatchController.handleEnd(req, res);
    });

    // Public routes.
    app.get('/players/:id/matches', (req, res) => {
      void matchHistoryController.getHistory(req, res);
    });
    app.get('/leaderboard', (req, res) => {
      void leaderboardController.getLeaderboard(req, res);
    });
    app.get('/leaderboard/champions', (req, res) => {
      void leaderboardController.getChampionWinRates(req, res);
    });

    await new Promise<void>((resolve) => {
      ApiMain.server = app.listen(port, () => resolve());
    });
  }

  /**
   * Test-only teardown hook — closes the server and connection pool started by `main()`, if any. Not part
   * of `docs/01_class_list.md`'s `ApiMain` entry (which specifies only `main()`); added solely so a smoke
   * test can start the real server and shut it back down without leaking an open port or pooled
   * connections between test runs.
   */
  static async stop(): Promise<void> {
    const server = ApiMain.server;
    ApiMain.server = null;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    const pool = ApiMain.pool;
    ApiMain.pool = null;
    if (pool) {
      await pool.close();
    }
  }
}
```

### 2. Create `packages/api/src/ApiMain.test.ts` with:

```ts
import { ApiMain } from './ApiMain';

describe('ApiMain', () => {
  afterEach(async () => {
    await ApiMain.stop();
    delete process.env.PORT;
    delete process.env.DATABASE_URL;
  });

  describe('main', () => {
    it('builds the app and starts listening without throwing', async () => {
      process.env.PORT = '0'; // OS-assigned ephemeral port -- avoids clashing with a real dev instance
      process.env.DATABASE_URL = 'postgresql://arena:arena@localhost:55432/arena_test';

      await expect(ApiMain.main()).resolves.toBeUndefined();
    });

    it('can be stopped and started again cleanly (no leaked listener)', async () => {
      process.env.PORT = '0';
      process.env.DATABASE_URL = 'postgresql://arena:arena@localhost:55432/arena_test';

      await ApiMain.main();
      await ApiMain.stop();
      await expect(ApiMain.main()).resolves.toBeUndefined();
    });

    it('actually serves requests on the wired routes, not just accepts connections', async () => {
      process.env.PORT = '41234'; // fixed, not '0' -- the test needs to know the URL to hit
      process.env.DATABASE_URL = 'postgresql://arena:arena@localhost:55432/arena_test';
      await ApiMain.main();

      const leaderboardRes = await fetch('http://localhost:41234/leaderboard');
      expect(leaderboardRes.status).toBe(200);
      expect(Array.isArray(await leaderboardRes.json())).toBe(true);

      const championsRes = await fetch('http://localhost:41234/leaderboard/champions');
      expect(championsRes.status).toBe(200);

      const historyRes = await fetch('http://localhost:41234/players/nobody-has-played-me/matches?page=1&pageSize=10');
      expect(historyRes.status).toBe(200);
      expect(await historyRes.json()).toEqual([]);

      // Validation still runs through the real controller -- a bad param is rejected, not silently ignored.
      const badHistoryRes = await fetch('http://localhost:41234/players/p1/matches');
      expect(badHistoryRes.status).toBe(400);

      // The internal begin/end routes are wired too -- an invalid body is rejected via the same
      // controller-catches/view-shows path, proving InternalMatchController is reachable.
      const beginRes = await fetch('http://localhost:41234/internal/matches/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(beginRes.status).toBe(400);

      const endRes = await fetch('http://localhost:41234/internal/matches/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(endRes.status).toBe(400);
    });
  });

  describe('stop', () => {
    it('is a no-op when main() has not been called', async () => {
      await expect(ApiMain.stop()).resolves.toBeUndefined();
    });
  });
});
```

(Requires `npm run test:db:up` first — same real Postgres test instance every other `packages/api`
integration test uses.)

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run test:db:up` first, then `npm run typecheck -w @arena/api` passes;
`npx jest ApiMain --coverage --collectCoverageFrom="src/ApiMain.ts"` — validated result: **4 tests passing,
100% statement/function/line coverage** (branch coverage 62.5% — the uncovered branches are the `??`
environment-variable fallback defaults and the resource-already-closed guards in `stop()`, none of which
carry game logic; per this prompt's own scope note, chasing 100% branch here would be over-engineering a
deliberately thin wiring class). Also re-run the full `packages/api` suite once (`npx jest`) to confirm
nothing else regressed — validated result: **8 suites, 54 tests, all passing**. Branch `api` from `main` (or
reuse an already-checked-out `api` branch), commit `Step 10: ApiMain implementation and smoke test`, push,
open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this is the last of the four `10_api_*` prompts — once its PR merges, `packages/api`'s full
Step 10 controller/view package is complete.** Do not add request logging, rate limiting, CORS
configuration, or any other production-hardening middleware "while you're in there" — none of that is in
this prompt's scope, and `prompts/09-10_implementation_plan.md` explicitly calls for a thin, unadorned
wiring class here.
