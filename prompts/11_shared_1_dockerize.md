# Prompt 11_shared_1 — Dockerize server and api (R-D4)

**Owner: Marshall.** Load `prompts/00_master_context.md` first.

### CRITICAL: what the SRS actually requires here — read this before writing a single Dockerfile
- **R-D4**: "The system shall be containerized with Docker such that each subsystem (game server, REST
  API) can be built and run as an independent container image." Note precisely which two subsystems: **game
  server and REST API only.** SRS 2.4 (Operating Environment) confirms this explicitly — the client's
  operating environment is "any evergreen desktop web browser," not a container; it does not get a
  Dockerfile in this prompt.
- **SRS 2.5**: "The system must be demonstrable running entirely locally via Docker, without requiring
  graders to have cloud infrastructure access." This is why a root-level `docker-compose.yml` (distinct
  from the existing `docker-compose.test.yml`, which is Postgres-only and exists solely for Jest
  integration tests — don't touch or reuse that file for this) is part of this prompt's scope: the full
  local stack (postgres, api, server) needs to come up with one command.
- This prompt does **not** need to make the client servable through Docker — that's `11_client_1`'s Vite
  dev/build/preview scripts, already a separate concern, already merged (check `git log` if unsure it's
  landed). A grader running the full local stack runs the client separately via `npm run preview -w
  @arena/client` (or `dev`), pointed at the Dockerized server/api via `VITE_SERVER_URL` — this is a
  reasonable split and matches the SRS's own operating-environment split (client = browser, not container).

---

### Process
1. **`packages/server/Dockerfile`** and **`packages/api/Dockerfile`** — standard multi-stage Node 20
   builds (per SRS 2.4's "Node.js 20+ runtime"): install workspace dependencies, typecheck, copy source,
   run the entry point (`node dist/index.js` if you add a build step producing `dist/`, or run directly via
   `ts-node`/`tsx` if that's simpler and already available — check what's already in each package's
   dependencies before adding a new one). Both packages currently have no `build` script producing
   JavaScript output (only `typecheck`) — decide whether to add one (compiling via `tsc`) as part of this
   prompt, since a container image should not need to compile TypeScript at every startup. Keep the image
   reasonably small — a multi-stage build (a `builder` stage with devDependencies, a slim final stage with
   only production dependencies + compiled output) is standard practice here, not over-engineering.
2. Each Dockerfile needs the **whole npm workspace** in its build context (both `packages/server` and
   `packages/api` depend on `packages/shared` via the npm workspace symlink mechanism, not a published
   package) — the Dockerfile's build context should be the repo root, not the individual package
   directory, and `COPY` in the whole `packages/` tree (or at minimum `packages/shared` plus the one
   subsystem being built) before running `npm install`.
3. **Root `docker-compose.yml`** — three services: `postgres` (reuse the same image/config pattern as
   `docker-compose.test.yml`, but this one is NOT ephemeral/test-only — give it a named volume so data
   persists across restarts, unlike the test one), `api` (built from `packages/api/Dockerfile`, depends on
   `postgres`, reads `DATABASE_URL` pointed at the `postgres` service, applies `packages/api/schema.sql` on
   first startup — check how `docker-compose.test.yml` already does this via `docker-entrypoint-initdb.d`
   and reuse that mechanism), `server` (built from `packages/server/Dockerfile`, depends on `api`, reads
   `API_BASE_URL` pointed at the `api` service's container-network address).
4. Verify for real: `docker compose up --build`, confirm both `server` and `api` actually start and stay up
   (not crash-looping) — check container logs, don't just check that `docker compose up` exits 0 for the
   build step. If you have a way to smoke-test this further (e.g. `curl` the api's `/leaderboard` endpoint,
   confirm the server accepts a socket connection), do that too and report what you saw.
5. Add a short new section to `docs/01_class_list.md` (or a new top-level `docs/` note if that reads
   better — your judgment) documenting the Docker setup: what `docker-compose up` starts, what env vars
   each service needs, and that the client is deliberately not included (per R-D4/SRS 2.4's scoping, cited
   above).

---

### Verification and Git
Report the real output of `docker compose up --build` (or a clear description of what you observed if the
raw log is too long to paste in full — but be specific about what confirms success, not just "it worked").
Commit directly to `main` if this touches only new files (`Dockerfile`s, `docker-compose.yml`, docs) with
no `packages/*/src` changes; if you end up adding `build` scripts to `package.json` or touching any source
file, use the normal branch/PR flow for whichever track(s) you touched instead. Commit message: `Step 11:
dockerize server and api (R-D4), add root docker-compose.yml for full local stack (SRS 2.5)`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: confirm the full stack actually starts clean from nothing — `docker compose down -v` (removing
the named postgres volume) then `docker compose up --build` from scratch — before calling this done. A
stack that only works because a previous run's postgres volume already has the schema applied is not
actually verified; the init-script mechanism must run correctly on a genuinely fresh volume.**
