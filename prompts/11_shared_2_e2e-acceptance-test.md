# Prompt 11_shared_2 — The required Playwright end-to-end acceptance test (Step 11, R-D5, 3.6.4)

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.

### CRITICAL prerequisite
**`11_client_1_build-tooling.md` must be merged to `main` first** — this prompt needs a buildable, servable,
network-connectable client. Check `git log` on `main` before starting.

### CRITICAL: this prompt is different in kind from almost everything before it in this project
Every prior Step 9/10 prompt validated one class in isolation. **Nothing has ever run `packages/shared`,
`packages/server`, `packages/client`, and `packages/api` together, as real processes, talking to each other
over real sockets and real HTTP.** `docs/ProjectProcess.txt` Step 11 is explicitly "conduct acceptance
tests; **fix faults if found**" — unlike `07_shared_1` (which was docs-only and explicitly told *not* to
touch `packages/`), **this prompt is authorized, and expected, to find and fix real integration bugs.**
Given the scale of what's being connected for the first time, finding at least one real bug here would not
be surprising — fix it the same way every other prompt in this project has: read the real current code,
understand why it's wrong, fix it, verify with a real test, document it. Do not paper over a failure by
weakening the test's assertions to make it pass.

This satisfies **R-D5**'s Playwright requirement and **3.6.4**'s "at least one automated end-to-end test
covering a complete match from connection through match end."

---

### Already traced — the real shape of what you're wiring together
- **`ApiMain.main()`** takes no parameters — reads `PORT` (default 4000) and `DATABASE_URL` (default
  `postgresql://arena:arena@localhost:5432/arena`) from the environment. It already has a matching
  `ApiMain.stop()` (closes the HTTP server and the `PgPool`) — built specifically so a test can start and
  cleanly tear down a real instance. Use it.
- **`ServerMain.main(port?)`** takes an optional port (falls back to `process.env.PORT` then `3001`), and
  reads `API_BASE_URL` from the environment for its `MatchReportingClient`. It has no `stop()` — check
  whether you need one (a global-teardown that just lets the test process exit is likely sufficient for a
  short-lived CI run, but confirm this doesn't leave a dangling `TickLoop` interval or open port that
  breaks a second test run in the same process — "likely sufficient" is doing real work in that sentence,
  verify it, don't just assume it).
- **The client's socket URL is `VITE_SERVER_URL`** (from `11_client_1`) — set this env var before starting
  the client's dev/preview server so it points at wherever you run `ServerMain.main()`.
- **Postgres**: reuse `docker-compose.test.yml` and the existing `npm run test:db:up`/`test:db:down`
  scripts exactly as `packages/api`'s own Jest integration tests already do — don't invent a second
  Postgres setup.
- **The full UI flow, with exact selectors already confirmed by reading the current components** (verify
  these are still accurate before relying on them — component code may have shifted slightly since this
  prompt was written):
  - Lobby: `form[aria-label="identify-form"]` containing `input#username` and a submit `button` ("Continue"),
    then a separate "Find Match" button once identified.
  - Champion Select: `ul[aria-label="champion-roster"]`, each champion has a button reading `Select
    {championName}` (e.g. "Select Korr", "Select Vex", "Select Rin").
  - Match HUD: `div[aria-label="movement-controls"]` with buttons "Move Up"/"Move Down"/"Move
    Left"/"Move Right"; `div[aria-label="ability-controls"]` with one button per ability, labeled by the
    ability's real name (e.g. "Arcane Bolt" for Vex).
  - Results: a "Return to Queue" button.

### Design
1. **`playwright.config.ts`** at the repo root (or `packages/client/` if that reads more naturally to you —
   your call, but be consistent with wherever the e2e test files themselves live; a new top-level
   `e2e/` directory is a reasonable place for both). Use Playwright's `webServer` option to start the
   client's dev/preview server automatically (per `11_client_1`'s new scripts) with `VITE_SERVER_URL`
   pointed at your test server port, and Playwright's `globalSetup`/`globalTeardown` to start Postgres
   (`test:db:up`), `ApiMain.main()`, and `ServerMain.main()` before the test run and tear them down
   (`test:db:down`, `ApiMain.stop()`, and whatever's needed to stop `ServerMain`) after.
2. **The test itself**: two Playwright `BrowserContext`s (two independent "browsers," simulating two real
   players — do not use two tabs in one context, since that would share cookies/storage in a way real
   separate players never would). Walk both through: identify (distinct usernames) → find match → (assert
   both reach Champion Select, matched against each other, opponent username visible) → each selects a
   champion → (assert both reach the Match HUD) → drive real combat via the actual ability/movement
   buttons, respecting real cooldowns (don't assume instant repeated clicks work — the server silently
   ignores an on-cooldown ability, per R4.2) → assert the match actually reaches a win condition and both
   players see a Results screen with a consistent outcome (one win, one loss — or handle the time-limit/draw
   path if you decide that's more reliable to drive deterministically than forcing an elimination within a
   reasonable test timeout; your call on which win condition to target, but justify the choice in your PR
   description).
3. **Budget real wall-clock time.** This is real, cooldown-gated, server-authoritative combat — not a mock.
   Set a generous Playwright test timeout (well beyond the default) rather than fighting the real timing;
   picking the lowest-HP, highest-single-hit-damage champion (Vex, per `docs/01_class_list.md`'s roster
   table) to eliminate quickly is a reasonable way to minimize how long this takes without cutting corners
   on realism.
4. Add this to root `package.json` as a new script (e.g. `"test:e2e": "playwright test"`), separate from
   the existing `test` script (which runs each workspace's Jest suite) — Step 11's e2e test should not run
   as part of every `npm test` invocation, since it's slow and requires Docker/Postgres; `11_shared_3` (CI)
   will decide how it's actually invoked in the pipeline.

### Process
1. Read every file named above in full before writing anything.
2. Get the full stack running manually first (by hand, in a terminal) before writing the Playwright test
   against it — confirm you can actually complete a match as a human before automating it. This is the
   fastest way to find integration bugs, and finding them this way is fine — the goal is a working e2e
   test, not a specific process for finding the bugs it's meant to catch.
3. Write the test, get it passing for real (not by weakening assertions).
4. **If you found and fixed a real bug along the way**: document it clearly in your PR description — what
   was broken, why, how you fixed it, and how you verified the fix (a targeted unit/integration test in the
   affected package, in addition to the e2e test now covering it). Update `docs/01_class_list.md` with a
   correction note if the fix changed any documented signature or behavior, matching the established format.

---

### Verification and Git
Report the real output of running the e2e test (pass, with real timing — how long did a full match actually
take?). If you touched any `packages/*/src` file to fix a real bug, that package's full existing test suite
must still pass too — report that. Commit the new `e2e/`/`playwright.config.ts` files directly to `main` if
they're the only changes; if you fixed a bug in `packages/`, use the normal branch/PR flow for whichever
track(s) you touched, and mention the e2e test's existence in that PR's description even though the test
file itself may live outside any single track's branch (use your judgment on how to split this if it
becomes awkward — a single PR touching both the e2e test and a `packages/server` fix, on the `server`
branch, is a reasonable pragmatic choice; don't force an artificial split).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: run the e2e test at least twice in a row, from a cold `docker compose down -v` / fresh Postgres
volume each time, before calling this done. A flaky end-to-end test that only passes once is worse than no
test — it erodes trust in the whole suite. If it's flaky, that's real signal about a real timing assumption
somewhere in the stack; chase it down rather than adding a retry to mask it.**
