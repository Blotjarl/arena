# Step 11 — Docker Setup (R-D4, SRS 2.5)

R-D4 requires that the game server and REST API each build and run as an independent container image.
SRS 2.4 (Operating Environment) scopes the client out of this: its environment is "any evergreen desktop
web browser," not a container, so it has no Dockerfile. SRS 2.5 requires the system be demonstrable
entirely locally via Docker, without cloud infrastructure access.

## What's containerized

| Package | Dockerfile | Not containerized |
|---|---|---|
| `packages/server` | `packages/server/Dockerfile` | — |
| `packages/api` | `packages/api/Dockerfile` | — |
| `packages/client` | — | Run via `npm run dev -w @arena/client` / `npm run preview -w @arena/client` against a browser |

Both Dockerfiles are standard multi-stage Node 20 builds. The build context for each is the **repo
root**, not the individual package directory — both `server` and `api` depend on `packages/shared` via
the npm workspace symlink mechanism (not a published package), so the whole workspace needs to be visible
to `npm ci`. Each Dockerfile:
1. `builder` stage — installs all workspace dependencies (incl. devDependencies), copies in
   `packages/shared` plus the one subsystem being built, compiles both via `tsc` (`npm run build`).
2. `runtime` stage — installs only production dependencies for those two workspaces, copies the compiled
   `dist/` output from the builder stage, and runs `node dist/index.js`. No TypeScript compiler ships in
   the final image.

## Root `docker-compose.yml`

Distinct from `docker-compose.test.yml` (Postgres-only, ephemeral, used solely by `npm run test:db:up`
for Jest integration tests — not touched by this setup). The root compose file brings up the full local
stack:

| Service | Image | Notes |
|---|---|---|
| `postgres` | `postgres:16` | Named volume `postgres-data` — data persists across restarts, unlike the test DB. Applies `packages/api/schema.sql` on first boot via `docker-entrypoint-initdb.d`. Healthcheck gates `api`'s startup. |
| `api` | built from `packages/api/Dockerfile` | Waits on `postgres` (healthy). |
| `server` | built from `packages/server/Dockerfile` | Waits on `api`. |

### Environment variables

| Service | Variable | Purpose |
|---|---|---|
| `postgres` | `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | fixed to `arena` / `arena` / `arena` in compose |
| `api` | `PORT` | HTTP port (`4000`) |
| `api` | `DATABASE_URL` | points at the `postgres` service on the container network |
| `server` | `PORT` | Socket.IO port (`3001`) |
| `server` | `API_BASE_URL` | points at the `api` service on the container network (`http://api:4000`) — used by `MatchReportingClient` |

### Running it

```bash
docker compose up --build
```

Starts Postgres (with schema applied on first run), the API on `localhost:4000`, and the server on
`localhost:3001`. Then, separately, point a client dev/preview server at it:

```bash
VITE_SERVER_URL=http://localhost:3001 npm run dev -w @arena/client
```

`docker compose down -v` removes the named Postgres volume for a genuinely clean-slate restart.

## Verified

From a fresh volume (`docker compose down -v` then `docker compose up --build`): `postgres` reports
healthy and has all three tables (`players`, `matches`, `match_participants`) from `schema.sql`; `api`
returns `200` on `GET /leaderboard` and `GET /leaderboard/champions` (a real query round-trip, not just a
process-up check); `server` completes a real Socket.IO polling handshake on `/socket.io/`. All three
containers stayed up (no crash-loop) for the duration of the check.

## A note on `packages/shared`'s build

Making these images actually runnable (not just buildable) required giving `packages/shared` a real build
step: it previously had no `build` script, and its `package.json` pointed `main`/`types` straight at
`src/index.ts`. That resolves fine under `ts-jest` (which transforms `.ts` files reached through the
workspace symlink) but fails under plain `node`, which cannot execute TypeScript source — confirmed by
`node packages/api/dist/index.js` throwing `ERR_MODULE_NOT_FOUND` prior to this fix. `packages/shared`
now has a `build` script (`tsc`) and `main`/`types` pointing at its compiled `dist/index.js` /
`dist/index.d.ts`, matching `packages/server` and `packages/api`'s existing convention. This is a
prerequisite for any of the three subsystems to run as compiled output, not a container-specific
concern — verified by re-running the full test suite (`shared`, `server`, `client`, `api`, 383 tests) with
no regressions.
