# Meta-Prompt 02 — Generate: Client Model Package (3 prompts)

**Your job is to WRITE PROMPT FILES, not implement application code directly.** You are generating
`09_client_1_identity-and-queue.md`, `09_client_2_match-model.md`, and `09_client_3_interpolation-buffer.md`.

**Owner of all three generated prompts: Raj** (per `prompts/09-10_implementation_plan.md` §4's Owner
column — `packages/client` is Raj's SRS track). Each generated `.md` file must open with `**Owner: Raj.**`,
matching the format at `09_server_2_participant-state.md:3`.

### CRITICAL: read first
1. `prompts/00_master_context.md`
2. `prompts/09-10_implementation_plan.md` (§2 test strategy, §5 scope notes)
3. `prompts/09_server_2_participant-state.md` — your quality/format bar. Match its rigor exactly: real
   stub transcribed, real implementation, real test file, real measured coverage numbers, standard git
   closing.

### Process (same for each of the three prompts)
1. Read the actual current stub in `packages/client/src/model/` — ground truth, not any doc summary.
2. TDD: write tests first, implement, `npm run typecheck -w @arena/client` + `npx jest <file> --coverage`
   until green. Report real numbers.
3. Revert (`git checkout -- <file>`, delete your test file) once verified — the code goes into the prompt,
   not a direct commit. Confirm `git status` clean under `packages/` before continuing.
4. Write the prompt file.

**MANDATORY reminder from master context §1.1, applies to every class here**: nothing you implement may
compute or override an authoritative value — these classes mirror and display what the server sends, they
never decide an outcome. Tests should include at least one assertion of this (e.g. "applying a state
payload stores it as-is, without altering any field").

---

### 1. `09_client_1_identity-and-queue.md` — `ClientIdentityModel` + `ClientQueueModel`
`identify(username)` persists to `sessionStorage` (R1.2 — survives a reload within the same browser
session; use `window.sessionStorage`, guard for a non-browser test environment if needed — `jsdom` via the
client's jest config provides `sessionStorage`, so this should just work in tests). `getPlayerId()` should
throw if called before `identify()`. `ClientQueueModel`'s three methods (`setQueued`/`setCancelled`/
`setMatched`) just update `status`/`position` fields per their existing TSDoc.

### 2. `09_client_2_match-model.md` — `ClientMatchModel`
Four `apply*` methods, each a straightforward "store what the server sent" per their existing TSDoc
(`applyMatchState` explicitly: "must not merge/alter values before storing"). Test each one stores the
exact payload it's given, and that `phase` stays `null` until `applyMatchStart` is called (per the
existing corrected TSDoc — `phase: MatchPhase | null`, not defaulting to `CHAMPION_SELECT` the way the
server's `MatchModel` does).

### 3. `09_client_3_interpolation-buffer.md` — `InterpolationBuffer`
This is a **CRITICAL CHECKPOINT** class (master context §8, item 5) — include a named test proving
`getInterpolatedPosition()` has zero side effects on any `ClientMatchModel` or other external state (it's
a pure read/compute). Design: `push(snapshot)` appends to a ring buffer capped at `capacity`, dropping the
oldest when full. `getInterpolatedPosition(playerId, now)` finds the two buffered snapshots bracketing
`now` (by whatever timestamp/tick field is available on `MatchStatePayload` — if snapshots don't carry a
wall-clock timestamp, use insertion order and assume roughly-even 50ms spacing between them, matching the
server's 20Hz tick rate) and linearly interpolates that player's `Position` between them. If fewer than two
samples are buffered, return the most recent known position rather than throwing.

---

### Verification and Git
Confirm `git status` shows only the three new `.md` files under `prompts/`. Commit directly to `main`
(`Add generated Step 9 prompts: client model package`), push. Update `prompts/README.md`'s Step 9 table.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: These three don't depend on each other or on any other Step 9 prompt — they can be executed by
Raj in any order, independently, as soon as they're written and reviewed.**
