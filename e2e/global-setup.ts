import { execSync } from 'node:child_process';
import path from 'node:path';
import { ApiMain } from '../packages/api/src/ApiMain';
import { ServerMain } from '../packages/server/src/ServerMain';
import { PgPool } from '../packages/api/src/util/PgPool';

const REPO_ROOT = path.resolve(__dirname, '..');

/** Matches docker-compose.test.yml exactly — the same test database packages/api's own Jest
 *  integration tests already use (prompts/09-10_implementation_plan.md §3). */
const DATABASE_URL = 'postgresql://arena:arena@localhost:55432/arena_test';
/** Distinct from the 4000/3001 local-dev defaults, so this suite never collides with a manually-run instance. */
export const API_PORT = 4100;
export const SERVER_PORT = 3101;

/**
 * `docker compose up -d` returns as soon as the container starts, not once Postgres is actually
 * accepting connections — the Postgres image also spends its first few seconds running
 * docker-entrypoint-initdb.d (schema.sql) before opening its real listener, so a fixed sleep would be
 * both slower than necessary and not actually safe. Polls with a real query instead.
 */
async function waitForPostgres(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    const pool = new PgPool(DATABASE_URL);
    try {
      await pool.query('SELECT 1', []);
      await pool.close();
      return;
    } catch (err) {
      lastErr = err;
      await pool.close().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Postgres at ${DATABASE_URL} did not become ready within ${timeoutMs}ms: ${String(lastErr)}`);
}

/**
 * Starts the real Postgres test container, then the real `ApiMain`/`ServerMain` processes (in this same
 * Node process — Playwright's test workers talk to them over real network sockets, so it makes no
 * difference that they're not separate OS processes), before the client's own `webServer` (configured in
 * playwright.config.ts) comes up pointed at `ServerMain`'s port. Returns the matching teardown.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  execSync('npm run test:db:up', { cwd: REPO_ROOT, stdio: 'inherit' });
  await waitForPostgres();

  process.env.PORT = String(API_PORT);
  process.env.DATABASE_URL = DATABASE_URL;
  await ApiMain.main();

  process.env.API_BASE_URL = `http://localhost:${API_PORT}`;
  await ServerMain.main(SERVER_PORT);

  return async function globalTeardown(): Promise<void> {
    await ServerMain.stop();
    await ApiMain.stop();
    execSync('npm run test:db:down', { cwd: REPO_ROOT, stdio: 'inherit' });
  };
}
