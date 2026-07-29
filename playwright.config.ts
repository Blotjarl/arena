import { defineConfig } from '@playwright/test';
import { SERVER_PORT } from './e2e/global-setup';

/** Distinct from Vite's 5173+ auto-picked local-dev ports, so this suite never collides with a manually-run instance. */
const CLIENT_PORT = 5273;

/**
 * The required Playwright end-to-end acceptance test (Step 11, R-D5, 3.6.4). Runs the real
 * `packages/shared`/`packages/server`/`packages/client`/`packages/api` stack together for the first
 * time, as real processes over real sockets and real HTTP — see e2e/global-setup.ts for Postgres/
 * ApiMain/ServerMain, and `webServer` below for the client itself.
 */
export default defineConfig({
  testDir: './e2e',
  // Real, cooldown-gated, server-authoritative combat — not mocked. A full match legitimately takes
  // tens of seconds; budget generously rather than fighting the real timing (prompt's own guidance).
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalSetup: require.resolve('./e2e/global-setup'),
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -w @arena/client -- --port ${CLIENT_PORT} --strictPort`,
    url: `http://localhost:${CLIENT_PORT}`,
    // Always start fresh — reusing a leftover dev server across runs is exactly the kind of hidden
    // state that would mask a real flakiness signal (see this prompt's closing requirement).
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_SERVER_URL: `http://localhost:${SERVER_PORT}`,
    },
  },
});
