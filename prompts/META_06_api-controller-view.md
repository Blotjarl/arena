# Meta-Prompt 06 — Generate: API Controller + View Package (4 prompts)

**Your job is to WRITE PROMPT FILES, not implement application code directly.**

**Owner of all four generated prompts: En** (per `prompts/09-10_implementation_plan.md` §4's Owner column —
`packages/api` is En's SRS track). Each generated `.md` file must open with `**Owner: En.**`, matching the
format at `09_server_2_participant-state.md:3`.

### CRITICAL: read first, and confirm the real prerequisite
1. `prompts/00_master_context.md`
2. `prompts/09-10_implementation_plan.md`
3. `prompts/09_server_2_participant-state.md` — your quality/format bar.
4. **`packages/api`'s entire model package must be merged first** (`09_api_1` through `09_api_5`).

### Process (same for each of the four prompts)
1. Read the actual current stub in `packages/api/src/`.
2. TDD: write tests first (use `supertest` against an Express app instance, or mock `Request`/`Response`
   directly if you prefer lighter unit tests over full HTTP integration — either is acceptable, pick one
   and be consistent across all four prompts), implement, `npm run typecheck -w @arena/api` + `npx jest
   <file> --coverage` until green. Report real numbers.
3. Revert, confirm `git status` clean, write the prompt file.

Each of the three route-handling prompts bundles its controller with its paired response-formatting view
(per `prompts/09-10_implementation_plan.md`'s Step 10 table) — format the response through the view class,
don't inline JSON-shaping in the controller.

---

### 1. `10_api_1_internal-match-controller.md` — `InternalMatchController.handleBegin`/`handleEnd` + `ErrorResponseView`
Not public-facing — only `MatchReportingClient` (server package) calls these, over the deployment's
private network (note this in the prompt, but you don't need to implement network-level access
restriction for a course project — document it as a deployment concern). `handleBegin`/`handleEnd` use
`PendingMatchCorrelator` then `MatchRepository.recordMatch()` once both halves are present.
`ErrorResponseView.render(error)` maps an `ArenaError` to an HTTP status + JSON body — pick a reasonable
status per exception `code` (e.g. `ValidationError` → 400, `PersistenceError` → 500, `PlayerNotFoundError`
→ 404) and document the mapping table in the prompt.

### 2. `10_api_2_match-history-controller.md` — `MatchHistoryController.getHistory` + `MatchHistoryResponseView`
`GET /players/:id/matches?page=&pageSize=` (R7.3) — calls `MatchRepository.findHistoryForPlayer`, formats
via the view into `MatchHistoryEntryDTO[]`.

### 3. `10_api_3_leaderboard-controller.md` — `LeaderboardController.get*` + `LeaderboardResponseView`
`GET /leaderboard`, `GET /leaderboard/champions` (R8.1-R8.3) — calls `LeaderboardRepository`, formats via
the view.

### 4. `10_api_4_api-main.md` — `ApiMain.main`
Builds the Express app, wires middleware and the three controllers above to routes (public routes and the
internal-only routes on separate concerns — see `10_api_1`'s note), connects `PgPool`, listens. A smoke
test that it starts without throwing is enough — don't over-engineer this one.

---

### Verification and Git
Confirm `git status` shows only these 4 new `.md` files. Commit directly to `main` (`Add generated Step 10
prompts: api controller and view package`), push. Update `prompts/README.md`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: This is the last meta-prompt batch — once these 4 are written and reviewed, all 30 generated
prompts plus the 6 already-validated ones (36 total, per the corrected count in
`prompts/09-10_implementation_plan.md`) exist. Update that document's §6 status section to reflect this
before finishing.**
