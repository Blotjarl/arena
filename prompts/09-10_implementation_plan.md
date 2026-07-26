# Steps 9–10 Implementation Plan (spec, not itself a prompt)

**CRITICAL: This document is not in the `NN_<track>_<seq>_<component>.md` naming/execution pattern — it is
the plan that governs how the 37 prompts under Step 9 and Step 10 get written.** Any session generating
one of those prompts (whether Marshall directly or a delegated "meta-prompt" session) must read this
document in full first, in addition to `prompts/00_master_context.md`. This freezes design decisions made
in chat on 2026-07-25 so they survive independent of any one conversation's context window.

---

## 1. How Steps 8/9/10 map to prompts

Steps 8 ("identify methods, write tests, implement, iterate") and 9 ("proceed in increments... until the
model package is done") are one continuous activity here, not two — every prompt below numbered `09_` *is*
one Step-8-style test/implement/iterate cycle, and the whole `09_` batch collectively satisfies Step 9.
Step 10 ("cover the rest of the functionality") is the `10_` batch: controller and view layers, once each
track's own model package is genuinely done.

**"Model package first" applies per track, not globally.** Arena's model code spans `shared` (domain/
champion data), `server` (authoritative game logic), `client` (state mirrors), and `api` (persistence).
Marshall's server-model finishes before server-controller starts; Raj's client-model before
client-controller; En's api-model before api-controller. The four tracks do not need to serialize against
each other — only against `shared`, which goes first for everyone.

---

## 2. Test strategy — applies to every one of the 37 prompts

- **TDD, in this order, per prompt**: write the test(s) first, from the class's existing TSDoc contract
  (Step 3 already documented every method's params/returns/`@throws` — the tests are close to
  write-once-from-the-doc) → run and watch them fail (`NotImplementedError`) → implement → run until green
  → typecheck → re-read the TSDoc comment against what actually got implemented and fix drift if any
  (Process Step 9: "change javadoc comments if necessary" — this is a mandatory step, not optional cleanup).
- **Colocated Jest tests**: `ClassName.test.ts` next to `ClassName.ts`, using `ts-jest` (already configured
  in every package from Step 2).
- **Coverage is measured, not just asserted**: every prompt's verification section requires running
  `npx jest --coverage` for the affected package and reporting the number — "excellent coverage" needs to
  be a number someone can check, not a vibe.
- **Named tests for the six critical-checkpoint areas** (`prompts/00_master_context.md` §8) — each of these
  gets a test that specifically exercises the checkpoint's failure mode, not just a happy-path test:
  1. `MatchmakingQueue.tryPairNext` — no double-pairing when called back-to-back for the same player.
  2. `TickLoop.onTick` — one match's `tick()` throwing does not stop any other registered match from
     ticking, and the error is logged, not swallowed silently or rethrown.
  3. `MatchModel.disconnect`/`reconnect` — a test at the exact grace-period boundary (29.9s vs. 30.1s),
     not just "immediately" and "way later."
  4. `PendingMatchCorrelator.recordBegin`/`recordEnd` — calling either twice with the same `matchId` does
     not create a duplicate pending entry or return a second combined record.
  5. `InterpolationBuffer.getInterpolatedPosition` — a test asserting the call has zero side effects on
     `ClientMatchModel` (the buffer is genuinely read-only with respect to authoritative state).
  6. Contract drift has no single test — it's enforced by `packages/shared` being the only package that
     defines `contract/` types, checked structurally by `tsc` across all four packages already.
- **`packages/server`'s game logic must be testable with zero network/socket dependency** (3.6.4, already
  true structurally since `ConnectionHandler` is a separate adapter — tests instantiate `MatchModel`/
  `ParticipantState`/`TickLoop`/`MatchmakingQueue` directly, never through a socket).
- **Out of scope for Steps 9–10**: the one required Playwright end-to-end test (R-D5) belongs to Step 11
  ("conduct acceptance tests") — it needs all three subsystems to have real behavior first. Don't add it
  early just because it would be convenient to; keep the step boundary clean.

---

## 3. Database testing approach — real PostgreSQL, not mocked

`packages/api`'s repository tests run against a real, disposable PostgreSQL instance via a
`docker-compose.test.yml` at the repo root, not a mock of `pg`. Rationale: mocking `PgPool.query` entirely
only verifies that a repository builds *a* SQL string, never that the SQL is *correct* against the actual
schema — for a persistence layer, that's the one thing worth testing. `PendingMatchCorrelator` is the
exception (pure in-memory `Map`, no DB, tested with plain Jest, no Docker needed).

- Schema lives at `packages/api/schema.sql` (plain DDL, no migration framework needed — this is a term
  project, not a production system with schema history to manage).
- `docker-compose.test.yml`: one `postgres:16` service, ephemeral (no volume), port mapped for local test
  runs, schema applied via the container's init-scripts mechanism (`docker-entrypoint-initdb.d`).
- Root `package.json` gets `"test:db:up": "docker compose -f docker-compose.test.yml up -d"` and
  `"test:db:down": "docker compose -f docker-compose.test.yml down"`.
- `packages/api`'s Jest config needs a `globalSetup`/`globalTeardown` or the tests assume the DB is already
  up (simpler — document that `npm run test:db:up` must run once before `npm test -w @arena/api`, rather
  than making Jest orchestrate Docker itself, which is fragile across CI/local environments).
- This is written and validated **once**, in `09_api_2_schema-and-pgpool.md` — every later api-model prompt
  (`09_api_3` through `09_api_5`) just uses the running test DB, it doesn't re-set-up anything.

---

## 4. Full prompt list (37)

Legend: **B** = highest-risk, written directly by Marshall's session (this one) with real validation
(implementation written, tests run) before being committed to a prompt file. **G** = generated from this
spec by a delegated session, following the scope notes in §5.

### Step 9 — model (16)

| # | File | Track | Scope | Depends on | Who | Owner |
|---|---|---|---|---|---|---|
| 1 | `09_shared_1_domain-value-objects.md` | shared | `Position.distanceTo`; `Champion.getAbility`; `ChampionRoster.getAll`/`getById` + real Korr/Vex/Rin numbers | none | G | **En** |
| 2 | `09_server_1_matchmaking-queue.md` | server | `MatchmakingQueue.join`/`cancel`/`tryPairNext` | none | G | **Marshall** |
| 3 | `09_server_2_participant-state.md` | server | `ParticipantState` — all 8 real methods | #1 (Champion/Ability) | **B** | **Marshall** |
| 4 | `09_server_3_matchmodel-champion-select.md` | server | `MatchModel.selectChampion`, `snapshot` | #1, #3 | **B** | **Marshall** |
| 5 | `09_server_4_matchmodel-combat.md` | server | `MatchModel.submitMove`/`submitAbility`/`tick`/`checkWinConditions` | #3, #4 | **B** | **Marshall** |
| 6 | `09_server_5_matchmodel-disconnect.md` | server | `MatchModel.disconnect`/`reconnect` | #4 | **B** | **Marshall** |
| 7 | `09_server_6_tickloop.md` | server | `TickLoop.start`/`stop`/`onTick` (per-match isolation) | #5 | **B** | **Marshall** |
| 8 | `09_client_1_identity-and-queue.md` | client | `ClientIdentityModel`, `ClientQueueModel` | none | G | **Raj** |
| 9 | `09_client_2_match-model.md` | client | `ClientMatchModel` — 4 apply* methods | none | G | **Raj** |
| 10 | `09_client_3_interpolation-buffer.md` | client | `InterpolationBuffer` | #9 | G | **Raj** |
| 11 | `09_api_1_pending-match-correlator.md` | api | `PendingMatchCorrelator` (no DB) | none | G | **En** |
| 12 | `09_api_2_schema-and-pgpool.md` | api | `packages/api/schema.sql`, `docker-compose.test.yml`, `PgPool.query` | none | **B** | **Marshall** (infra prerequisite — see note below) |
| 13 | `09_api_3_player-repository.md` | api | `PlayerRepository.findOrCreateByUsername` | #12 | G | **En** |
| 14 | `09_api_4_match-repository.md` | api | `MatchRepository.recordMatch`/`findHistoryForPlayer`, `LeaderboardEntry.fromRow` | #12 | G | **En** |
| 15 | `09_api_5_leaderboard-repository.md` | api | `LeaderboardRepository.computeLeaderboard`/`computeChampionWinRates` | #12, #14 | G | **En** |

(Table shows 15 rows because #12's schema prompt and #13–15 share dependency #12 — 16th item is the
`09_shared_1` row already counted as #1. Total: 16.)

**Two rows break the naive track→person mapping, on purpose — both are flagged in their own prompt file
too, not just here:**
- **Row 1 (`09_shared_1`) is Owner: En, not Marshall**, even though it lives in the `shared` package
  Marshall otherwise owns as a framework. The actual work here — inventing Korr/Vex/Rin's ability numbers
  — is game-design content, En's SRS Appendix C responsibility, not framework code. `Position.distanceTo`
  is trivial and rides along in the same file only because it's a same-package dependency.
- **Row 12 (`09_api_2`) is Owner: Marshall, not En**, even though it lives in the `api` package En
  otherwise owns. This is infrastructure (`schema.sql`, Docker test harness, `PgPool`) that every one of
  En's later repository prompts (#13–15) depends on to even run their tests — Marshall built and validated
  it directly as one of the six **B** prompts so En isn't blocked waiting on it, not because the repository
  *logic* itself is Marshall's to design.

### Step 10 — controller/view (21)

| # | File | Track | Scope | Who | Owner |
|---|---|---|---|---|---|
| 1 | `10_server_1_player-identify-controller.md` | server | `PlayerIdentifyController.operation` | G | **Marshall** |
| 2 | `10_server_2_matchmaking-controller.md` | server | `MatchmakingController.operation` | G | **Marshall** |
| 3 | `10_server_3_champion-select-controller.md` | server | `ChampionSelectController.operation` | G | **Marshall** |
| 4 | `10_server_4_combat-controller.md` | server | `CombatController.operation` | G | **Marshall** |
| 5 | `10_server_5_disconnect-controller.md` | server | `DisconnectController.operation` | G | **Marshall** |
| 6 | `10_server_6_connection-and-reporting.md` | server | `ConnectionHandler.register`, `MatchReportingClient.report*` | G | **Marshall** |
| 7 | `10_server_7_broadcast-views.md` | server | `MatchmakingBroadcastView`, `MatchBroadcastView` — `modelChanged` | G | **Marshall** |
| 8 | `10_server_8_server-main.md` | server | `ServerMain.main` (wiring, smoke test) | G | **Marshall** |
| 9 | `10_client_1_socket-connection-controller.md` | client | `SocketConnectionController` | G | **Raj** |
| 10 | `10_client_2_lobby-controller.md` | client | `LobbyController.operation` | G | **Raj** |
| 11 | `10_client_3_champion-select-controller.md` | client | `ChampionSelectController.operation` | G | **Raj** |
| 12 | `10_client_4_match-controller.md` | client | `MatchController.operation` | G | **Raj** |
| 13 | `10_client_5_lobby-view.md` | client | `LobbyView` + `LobbyScreen` (React Testing Library) | G | **Raj** |
| 14 | `10_client_6_champion-select-view.md` | client | `ChampionSelectView` + `ChampionSelectScreen` | G | **Raj** |
| 15 | `10_client_7_match-hud-view.md` | client | `MatchHUDView` + `MatchHUDScreen` | G | **Raj** |
| 16 | `10_client_8_results-view.md` | client | `ResultsView` + `ResultsScreen` | G | **Raj** |
| 17 | `10_client_9_client-main.md` | client | `ClientMain.main` (wiring) | G | **Raj** |
| 18 | `10_api_1_internal-match-controller.md` | api | `InternalMatchController.handleBegin`/`handleEnd` + `ErrorResponseView` | G | **En** |
| 19 | `10_api_2_match-history-controller.md` | api | `MatchHistoryController.getHistory` + `MatchHistoryResponseView` | G | **En** |
| 20 | `10_api_3_leaderboard-controller.md` | api | `LeaderboardController.get*` + `LeaderboardResponseView` | G | **En** |
| 21 | `10_api_4_api-main.md` | api | `ApiMain.main` (wiring) | G | **En** |

All of Step 10 is **G** — none of it needs the same depth of algorithmic validation the six `09_server_*`
and `09_api_2` prompts do; controllers are thin dispatchers over already-implemented model methods, and
views are formatters. Standard TDD-from-the-TSDoc-contract, same as everything else, is sufficient.

---

## 5. Scope notes for generated (`G`) prompts

Each `G` prompt should follow the same shape as the `03_*` and `02_*` prompts: CRITICAL sandwich open/close,
load `00_master_context.md` + this spec, list of files, TDD instructions per §2 above, verification
(typecheck + coverage number), git workflow per master context §9.4. The class's existing declaration
(from Step 2/3) already specifies the exact signature and `@throws` list — a generating session should
read the actual current file, not re-derive the signature from `01_class_list.md`, since Step 3's TSDoc
pass may have refined details the original class list doesn't have.

**Every generated prompt must open with an explicit `**Owner: <name>.**` line**, exactly like the six `B`
prompts do (see `09_server_2_participant-state.md:3` for the format) — copy the name straight from the
`Owner` column in §4's tables above, not the `Track` column. This is not cosmetic: the whole point of
tracking ownership per-prompt is so whoever picks up a `.md` file later (Marshall doing a review, or Raj/En
deciding what to run next) can tell at a glance whose work it is without cross-referencing this spec.

**Champion balance numbers for `09_shared_1`** don't exist yet anywhere — whoever writes that prompt is
inventing real numbers (cooldowns, resource costs, ranges, magnitudes) for Korr/Vex/Rin's abilities, not
just transcribing something already decided. Keep them simple and round; this is a course project, not a
balance-patched live game — internal consistency (a tankier champion has slower abilities, a burst mage
has high magnitude/low health) matters more than precision.

**`10_client_5` through `10_client_8`** (the four screens) need React Testing Library, not just Jest —
already a devDependency per Step 2. Tests should assert on rendered output and simulated user interaction
(`fireEvent`/`userEvent`), not on implementation details.

---

## 6. Status

All six `B` prompts are written and validated (implemented for real against this repo, tested — including
a real Postgres container for the schema/PgPool one — then reverted to stubs so the actual commit happens
through the normal branch/PR flow, not as a direct edit bypassing it):

- `09_server_2_participant-state.md`
- `09_server_3_matchmodel-champion-select.md`, `09_server_4_matchmodel-combat.md`, `09_server_5_matchmodel-disconnect.md`
- `09_server_6_tickloop.md`
- `09_api_2_schema-and-pgpool.md`

Also fixed as a direct infrastructure commit (not a prompt — mechanical, no design judgment involved):
`jest.config.js` added to all four packages. There was no Jest configuration anywhere in the repo before
this; without it, every test in every one of the 37 prompts would fail with a syntax error, since Jest was
silently falling back to a plain Babel transform that cannot parse TypeScript.

Remaining: 31 `G` prompts, to be generated from this spec by delegated sessions, per §5 above and the
chat response accompanying this document for the batch/handoff plan.
