# Prompt 11_shared_3 — CI pipeline (R-D5)

**Owner: Marshall.** Load `prompts/00_master_context.md` first.

### CRITICAL prerequisite
**`11_shared_2_e2e-acceptance-test.md` must be merged to `main` first** — this prompt wires the Playwright
test into CI; it needs to already exist and pass locally. Check `git log` on `main` before starting.

### CRITICAL: what R-D5 actually requires
"The system's automated test suite (Jest for unit tests, Playwright for end-to-end tests) shall run in a
continuous integration pipeline on every change proposed to the shared code repository." Two concrete,
verifiable things: (1) every package's Jest suite runs, (2) the Playwright e2e test runs, both on every
push/PR. This repo has **no CI configuration of any kind right now** (confirmed: no `.github/workflows`
directory exists) — every merge to `main` so far has been gated only by whoever reviewed the PR running
tests locally. This prompt is the first time that becomes automated and enforced.

---

### Design
1. **`.github/workflows/ci.yml`** — a GitHub Actions workflow, triggered on `push` and `pull_request`
   against any branch (or at minimum `main` and PRs targeting it — your call, but every branch this
   project actually uses — `shared`/`server`/`client`/`api` — should be covered, not just `main`).
2. **Jobs**: at minimum, typecheck + Jest for all four workspaces. `packages/api`'s Jest suite needs a real
   Postgres — GitHub Actions supports this via a `services:` block running `postgres:16` as a service
   container for the job, with the schema applied the same way `docker-compose.test.yml` already does it
   (reuse that file's approach/image, don't invent a second schema-application mechanism). Consider whether
   to run all four workspaces' typecheck+test as one job or split per-workspace into a matrix — a matrix
   gives clearer per-track pass/fail visibility and lets independent tracks' failures not block each other
   in the UI, but is more setup; a single job is simpler. Your judgment, but explain the choice.
3. **A separate job (or a later step in the same job) for the Playwright e2e test** — this one needs
   Postgres too, plus actually starting `ApiMain`/`ServerMain`/the client's dev server the same way
   `11_shared_2`'s `playwright.config.ts` already orchestrates locally (via its `webServer`/
   `globalSetup`/`globalTeardown`) — if that's already fully self-contained, this job may be as simple as
   "run `npm run test:e2e`" with the Postgres service container available. Verify this is actually true
   rather than assuming it.
4. Every job should fail the workflow (non-zero exit) on any typecheck error or test failure — this is the
   whole point; don't swallow failures to make the workflow "green."

### Process
1. Read `packages/api/jest.config.js`, `docker-compose.test.yml`, `11_shared_2`'s `playwright.config.ts`
   (once merged), and every workspace's `package.json` scripts before writing the workflow — the workflow
   should call the same npm scripts already established (`npm run typecheck`, `npm test`, `npm run
   test:e2e`), not reinvent how these packages get tested.
2. Write the workflow file.
3. **Verify it actually works** — push a branch and confirm the workflow runs and passes on GitHub, not just
   that the YAML is syntactically valid. If you don't have a way to trigger and observe a real run as part
   of this session, say so explicitly and clearly in your summary rather than claiming this is verified
   when it isn't — this would be the one prompt in this whole project where "I wrote a plausible-looking
   config" and "I confirmed it actually runs green on GitHub" are meaningfully different claims, and the
   difference matters.
4. Add a short section to the top-level project README (or `docs/01_class_list.md` if there's no better
   home — your judgment) noting CI now runs on every push/PR and what it covers.

---

### Verification and Git
Report exactly what you were able to verify (see point 3 above — be precise about local-only vs.
actually-observed-on-GitHub). Commit directly to `main` (CI config, not application code — no `packages/`
changes expected for this prompt; if you find yourself needing to change a package's script to make CI
work, that's a small enough addition to include in the same commit, but flag it clearly).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: after this merges, the very next PR anyone opens against this repo (yours or anyone else's)
is the real test of whether this prompt succeeded — it should show CI results directly in the PR, not
just merge silently the way every PR before this one did. If you have a way to open a small, disposable
test PR to confirm this before finishing, do that; if not, say so explicitly rather than assuming it.**
