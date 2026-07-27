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
