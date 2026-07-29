# Arena Prompts Index

**CRITICAL: Load `prompts/00_master_context.md` before any prompt below.** File naming is
`NN_<track>_<seq>_<component>.md` per master context §9.3 — `NN` is the `docs/ProjectProcess.txt` step
number, `<track>` is `shared`/`server`/`client`/`api`, `<seq>` orders prompts within that step+track.

## Prompt 0

| File | Purpose |
|---|---|
| `00_master_context.md` | MoT Prompt 0 — persistent context for every session, every track. |

## Step 2 — Skeleton of the source code

Thirteen prompts, run in this order (a single session executes all of them — the three tracks don't
parallelize yet because `server`, `client`, and `api` all depend on `shared` existing first, and the
process explicitly requires the model package to be "relatively complete" before controller/view). Model
packages (5–7) come before controllers (8–10), which come before views + entry points (11–13).

| # | File | Component(s) | Status |
|---|---|---|---|
| 1 | `02_shared_1_workspace-and-skeleton.md` | Monorepo structure, configs, `NotImplementedError` | [x] |
| 2 | `02_shared_2_mvc-framework.md` | Model, View, Controller, ModelEvent, ModelListener, AbstractModel, AbstractController | [x] |
| 3 | `02_shared_3_domain-and-contract.md` | Domain vocabulary (14 files) + wire contract (3 files) | [x] |
| 4 | `02_shared_4_exceptions.md` | ArenaError + 15 subclasses, `packages/shared/src/index.ts` barrel | [x] |
| 5 | `02_server_1_model.md` | QueueEntry, MatchmakingQueue, ParticipantState, MatchModel, TickLoop | [x] |
| 6 | `02_client_1_model.md` | ClientIdentityModel, ClientQueueModel, ClientMatchModel, InterpolationBuffer | [x] |
| 7 | `02_api_1_model.md` | PgPool, PlayerRepository, MatchRepository, LeaderboardEntry, LeaderboardRepository, PendingMatchCorrelator | [x] |
| 8 | `02_server_2_controller.md` | 5 controllers + ConnectionHandler + MatchReportingClient | [x] |
| 9 | `02_client_2_controller.md` | SocketConnectionController + 3 controllers | [x] |
| 10 | `02_api_2_controller.md` | InternalMatchController, MatchHistoryController, LeaderboardController | [x] |
| 11 | `02_server_3_view-and-main.md` | MatchmakingBroadcastView, MatchBroadcastView, ServerMain | [x] |
| 12 | `02_client_3_view-and-main.md` | 4 screen views, ClientMain | [x] |
| 13 | `02_api_3_view-and-main.md` | 3 response views, ApiMain | [x] |
| 14 | `02_shared_5_class-list-reconciliation.md` | Docs-only fix: reconcile `docs/01_class_list.md` with 3 correct-but-undocumented Step 2 deviations | [x] |

Check a box (in a commit) as each prompt's work is merged to `main`, not merely committed to its track
branch — see master context §9.4. Row 14 exists because a post-Step-2 audit found the class list hadn't
caught up to some of the code's own correct refinements — see that prompt for detail.

## Step 3–5 — Declarations complete, javadoc, compiles, initial API docs

Five prompts. `docs/ProjectProcess.txt` Step 4 ("make sure your code compiles") isn't a separate prompt —
it's satisfied by each of these prompts' own mandatory typecheck, same as Step 2. **This is the first
batch where the three tracks genuinely run in parallel**: `03_server_1` (Marshall), `03_client_1` (Raj),
and `03_api_1` (En) don't depend on each other or on `03_shared_1` merging — each only needs to *read*
`03_shared_1`'s TSDoc convention (§1), not wait for it. `03_shared_2` is the exception: it must run last,
after all four of the others are merged, since it generates documentation from what they wrote.

| # | File | Owner | Component(s) | Depends on | Status |
|---|---|---|---|---|---|
| 1 | `03_shared_1_tsdoc-and-contingency-review.md` | **Marshall** | `packages/shared` — establishes the TSDoc convention | none | [x] |
| 2 | `03_server_1_tsdoc-and-contingency-review.md` | **Marshall** | `packages/server` | reads 1's §1 only | [x] |
| 3 | `03_client_1_tsdoc-and-contingency-review.md` | **Raj** | `packages/client` | reads 1's §1 only | [x] |
| 4 | `03_api_1_tsdoc-and-contingency-review.md` | **En** | `packages/api` | reads 1's §1 only | [x] |
| 5 | `03_shared_2_typedoc-generation.md` | **Marshall** | TypeDoc setup + initial generation, `docs/api/` | 1, 2, 3, and 4 all merged | [x] |

If any of prompts 1–4 finds a genuine gap in the exception set (rare — see each prompt's §3), it adds a
new exception class to `packages/shared/src/exceptions/` directly as part of its own commit rather than
blocking on a separate prompt; this is a small enough addition to be low-conflict even with two tracks
touching `shared` the same day.

## Step 6 — Reverse-engineer the code into a UML class diagram

One prompt. Writes and runs `scripts/generate-class-diagram.js`, a deterministic TypeDoc-JSON-to-Mermaid
generator validated against this repo before being written into the prompt, producing
`docs/06_class_diagram_reverse-engineered.html` in the same visual template as Step 1's diagram. Step 1's
diagram is left untouched, on purpose — comparing "planned" vs. "actual" is Step 7's job. The generator
script is also what Step 12 (the final reverse-engineering pass) will reuse unmodified.

| # | File | Owner | Component(s) | Status |
|---|---|---|---|---|
| 1 | `06_shared_1_reverse-engineer-class-diagram.md` | **Marshall** | `scripts/generate-class-diagram.js`, `docs/06_class_diagram_reverse-engineered.html` | [ ] |

## Step 9 — Model package complete (Step 8 test/implement/iterate cycles, batched)

Governed by `prompts/09-10_implementation_plan.md`, not by this README alone — read that spec before
generating or executing any `09_*` prompt. Per that plan's §4, `09_shared_1` is **Owner: En** even though
it lives in `packages/shared` (game-design content, not framework code), and it must merge to `main`
promptly — `09_server_3` depends on it and cannot run for real until it's merged.

| # | File | Track | Owner | Depends on | Status |
|---|---|---|---|---|---|
| 1 | `09_shared_1_domain-value-objects.md` | shared | **En** | none | [x] |
| 2 | `09_server_1_matchmaking-queue.md` | server | **Marshall** | none | [x] |
| 3 | `09_server_2_participant-state.md` | server | **Marshall** | #1 (Champion/Ability) | [x] |
| 4 | `09_server_3_matchmodel-champion-select.md` | server | **Marshall** | #1, #3 | [x] |
| 5 | `09_server_4_matchmodel-combat.md` | server | **Marshall** | #3, #4 | [x] |
| 6 | `09_server_5_matchmodel-disconnect.md` | server | **Marshall** | #4 | [x] |
| 7 | `09_server_6_tickloop.md` | server | **Marshall** | #5 | [x] |
| 8 | `09_client_1_identity-and-queue.md` | client | **Raj** | none | [x] |
| 9 | `09_client_2_match-model.md` | client | **Raj** | none | [x] |
| 10 | `09_client_3_interpolation-buffer.md` | client | **Raj** | #9 (CRITICAL CHECKPOINT) | [x] |
| 11 | `09_api_1_pending-match-correlator.md` | api | **En** | none | [x] |
| 12 | `09_api_2_schema-and-pgpool.md` | api | **Marshall** (infra prerequisite) | none | [x] |
| 13 | `09_api_3_player-repository.md` | api | **En** | #12 | [x] |
| 14 | `09_api_4_match-repository.md` | api | **En** | #12 | [x] |
| 15 | `09_api_5_leaderboard-repository.md` | api | **En** | #12, #14 | [x] |

Rows 3–7 and 12 (marked `[x]`) are the six **B** prompts — written and validated directly against this
repo (implemented, tested, then reverted to a stub) before being committed as prompt files; rows 8–11 and
13–15 were generated by delegated sessions from `prompts/09-10_implementation_plan.md` §5, `[ ]` until
whoever owns each one actually executes and merges the work. All 15 Step 9 prompts are now generated —
none remain outstanding.

## Step 10 — Controller/view package (server + client + api tracks — 21 of 21 prompts)

Governed by `prompts/09-10_implementation_plan.md` §4's Step 10 table, same as Step 9. All eight of
Marshall's `server` track prompts, all nine of Raj's `client` track prompts, and all four of En's `api`
track prompts below are now generated — none remain outstanding.

| # | File | Depends on | Status |
|---|---|---|---|
| 1 | `10_server_1_player-identify-controller.md` | server model package (`09_server_1`–`6`) | [x] |
| 2 | `10_server_2_matchmaking-controller.md` | server model package; CRITICAL — the only place a `MatchModel` is constructed and registered with `TickLoop` | [x] |
| 3 | `10_server_3_champion-select-controller.md` | `10_server_2` | [x] |
| 4 | `10_server_4_combat-controller.md` | `10_server_2` | [x] |
| 5 | `10_server_5_disconnect-controller.md` | `10_server_2` | [x] |
| 6 | `10_server_6_connection-and-reporting.md` | `10_server_1`–`5` | [x] |
| 7 | `10_server_7_broadcast-views.md` | `10_server_2`, `10_server_3` | [x] |
| 8 | `10_server_8_server-main.md` | `10_server_1`–`7` (wires everything) | [x] |
| 9 | `10_server_9_match-reporting-wiring.md` | `10_server_6`, `10_server_8` — closes a real gap found in a full-project SRS audit: `MatchReportingClient` was implemented and tested but never wired to a real call site, so R7.1–R7.4/R8.1–R8.3/R-DB1–R-DB6 were non-functional end-to-end | [x] |
| 10 | `10_server_10_matchmaking-lifecycle-and-reconnection.md` | Two more real gaps found by `07_shared_1`'s audit: R2.2's "already in an active match" guard was silently unenforced, R2.5's concurrent-match count never released; and R6.1–R6.4 (reconnection) has no server-side rebinding path. Blocks `10_client_10` | [x] |

All eight of Marshall's original `server`-track Step 10 prompts are merged to `main` — `packages/server`'s
controller/view package is otherwise complete (136 tests passing, 100% coverage on every controller/view
file except `ServerMain.ts`, which is intentionally a smoke test per its own prompt's scope note). Prompts
9 and 10 above are same-track addenda, not part of the original 21 — both must run before Step 11
(acceptance testing), since an end-to-end test covering a complete match would otherwise immediately
expose these gaps.

Two small corrections ride along in this batch, each documented in the prompt that surfaces it: `09_server_1`'s
`MatchmakingQueue.join`/`cancel` gain a `playerId` field in their internal (non-wire) broadcast payload
(`10_server_2`), and `packages/shared/src/contract/dto.ts` gains `MatchBeginReportDTO`/`MatchEndReportDTO`
(`10_server_6`) — see that prompt for why `MatchReportingClient`'s original `MatchParticipant[]`-based
signature couldn't work as sketched.

### Client track (9)

Owner: **Raj**, per `prompts/09-10_implementation_plan.md` §4. Prompts 5–8 (the four screens) use React
Testing Library, not just Jest, per that plan's §5 scope note. All nine reiterate master context §1.1 (the
client renders what the server sends and never computes an outcome) in their own text, per this batch's
closing requirement.

| # | File | Depends on | Status |
|---|---|---|---|
| 1 | `10_client_1_socket-connection-controller.md` | client model package (`09_client_1`–`3`); gains a constructor-injected `Socket` (correction) | [x] |
| 2 | `10_client_2_lobby-controller.md` | `10_client_1` | [x] |
| 3 | `10_client_3_champion-select-controller.md` | `10_client_1` | [x] |
| 4 | `10_client_4_match-controller.md` | `10_client_1`; CRITICAL CHECKPOINT — move-throttle sentinel bug caught by its own test suite | [x] |
| 5 | `10_client_5_lobby-view.md` | `10_client_2`; corrects `ClientIdentityModel`/`ClientQueueModel`'s missing `notifyChanged` calls | [x] |
| 6 | `10_client_6_champion-select-view.md` | `10_client_3`, `10_client_5`; corrects all four `ClientMatchModel.apply*` methods' missing `notifyChanged` calls | [x] |
| 7 | `10_client_7_match-hud-view.md` | `10_client_4`, `10_client_6`; CRITICAL CHECKPOINT — `InterpolationBuffer` output never written back to `ClientMatchModel` | [x] |
| 8 | `10_client_8_results-view.md` | `10_client_2`, `10_client_6`; pairs with `LobbyController`, not a dedicated controller (docs/01_class_list.md §6c gap-fill) | [x] |
| 9 | `10_client_9_client-main.md` | `10_client_1`–`8` (wires everything); smoke test only, per plan §5 | [x] |
| 10 | `10_client_10_reconnect-on-socket-reconnect.md` | `10_server_10` (server-side rebinding must merge first) — closes R6.1–R6.4's client-side gap: the client never emitted `match:reconnect` anywhere | [x] |

All nine of Raj's original `client`-track Step 10 prompts are now merged to `main` (PR #30) — `packages/client`'s
controller/view package is complete (128 tests passing across 17 suites, 98%+ statement coverage; every
controller/view file at 100% except `ClientMain.tsx`, intentionally a smoke test per its own prompt's scope
note, and two views with one defensive, unreachable fallback branch each).

The client model package (`09_client_1`–`3`, merged) turned out to have a real gap: none of
`ClientIdentityModel`/`ClientQueueModel`/`ClientMatchModel`'s mutator methods called `notifyChanged()`, so
the entire push-MVC view layer would have been silently inert. `10_client_5` and `10_client_6` fix this
once each, additively — no other prompt in the batch repeats it. Several views also need more than the one
model their `docs/01_class_list.md` §6c constructor sketch names (e.g. `LobbyView` needs `ClientQueueModel`
alongside `ClientIdentityModel` to show queue status); each such prompt documents the correction and adds
the extra model as an accessor outside the formal `View<M,C>` contract, not by widening that contract.

**Review note:** the branch as originally submitted for merge contained a bad merge commit (a mid-batch
`git merge main` whose conflict resolution accidentally reverted `packages/shared`, `packages/server`, and
`packages/api` to stale/stub content — 108 files, +2,911/−11,947 lines relative to `main`). Caught in review
before merging; fixed by rebasing the branch's real commits onto current `main` (dropping the bad merge)
and recovering the one commit's legitimate new work that had been bundled into that same merge, then fully
re-verified (`npm run typecheck --workspaces` clean, full client suite green) before merging.

### Api track (4)

Owner: **En**, per `prompts/09-10_implementation_plan.md` §4. All three REST controllers
(`InternalMatchController`, `MatchHistoryController`, `LeaderboardController`) use the default (untyped)
`AbstractController` generics via a shared `nullMvc.ts` helper introduced in `10_api_1` — see that prompt's
design note 4 for why (no domain `Model`/push-based `View` exists for a synchronous HTTP response to
observe).

| # | File | Depends on | Status |
|---|---|---|---|
| 1 | `10_api_1_internal-match-controller.md` | api model package (`09_api_1`–`5`); CRITICAL correction — `BeginParticipant` gains `username`, `InternalMatchController` resolves canonical player ids via `PlayerRepository` before persisting | [x] |
| 2 | `10_api_2_match-history-controller.md` | `10_api_1` (shared `nullMvc.ts`); corrects `MatchRepository.findHistoryForPlayer`'s return shape to include the match opponent's username | [x] |
| 3 | `10_api_3_leaderboard-controller.md` | `10_api_1` (shared `nullMvc.ts`) | [x] |
| 4 | `10_api_4_api-main.md` | `10_api_1`–`3` (wires everything); smoke test only, per plan §5 | [x] |

`10_api_1` surfaces a genuine, load-bearing correctness gap found by implementing it for real:
`match_participants.player_id` has a foreign key to `players(id)`, but the live match's `playerId` is a
transient, client-generated session id (R1.2) that `PlayerRepository` never created a row for — persisting
it directly would fail every single `recordMatch` call's foreign-key constraint. The fix adds `username` to
`PendingMatchCorrelator.BeginParticipant` (`09_api_1`, already-merged) and has `InternalMatchController`
resolve each participant's canonical id via `PlayerRepository.findOrCreateByUsername` before persisting.
**This has an unresolved cross-track follow-up**: `packages/shared/src/contract/dto.ts`'s
`MatchBeginReportDTO` (added by `10_server_6`, not yet executed) still matches the *old* shape with no
`username` field — `10_api_1`'s design note 5 flags this explicitly; it must be corrected before
`10_server_6` is executed, or the two tracks' real end-to-end match-reporting flow will not work.

## Step 7 — Reconcile class diagram and docs against the real code

Steps 9–10 (all 37 prompts, including the `10_server_9` addendum above) are now fully implemented. This
prompt is `docs/ProjectProcess.txt` step 7 itself: bring `docs/01_class_list.md` and
`docs/06_class_diagram_reverse-engineered.html` back in line with the real, tested, merged code — docs
only, no `packages/` changes.

| # | File | Owner | Status |
|---|---|---|---|
| 1 | `07_shared_1_diagram-reconciliation.md` | **Marshall** | [x] |

This pass found two more real (non-doc) gaps, per its own closing requirement to surface rather than
silently absorb anything beyond documentation drift: `10_server_10_matchmaking-lifecycle-and-reconnection.md`
and `10_client_10_reconnect-on-socket-reconnect.md` above fixed them — both are now merged, so R2.2, R2.5,
and R6.1–R6.4 are functional end-to-end (server-side rebinding verified via code + test inspection;
client-side emission verified via its own mocked-socket test suite — genuine two-client end-to-end
reconnection has not been manually exercised against a live server).

## Step 11 — Conduct acceptance tests; fix faults if found

`docs/ProjectProcess.txt` step 11, verbatim. Six prompts — nothing in `packages/` has ever actually been
run together as live processes before this batch; two real gaps were found just designing the first four
prompts (the client has no build tooling at all, and its socket connection is hardcoded same-origin) and
were fixed as prerequisites rather than discovered mid-test. A full post-batch audit found two more real
gaps that prompt 3's own e2e test never covered — prompt 5 closes those. Manually testing the deployed-
locally app surfaced a sixth: the client has never had any visual design pass — prompt 6 closes that.

| # | File | Owner | Depends on | Status |
|---|---|---|---|---|
| 1 | `11_client_1_build-tooling.md` | **Raj** | none | [x] |
| 2 | `11_shared_1_dockerize.md` | **Marshall** | none (independent of 1) | [x] |
| 3 | `11_shared_2_e2e-acceptance-test.md` | **Marshall** | #1 (needs a servable client) | [x] |
| 4 | `11_shared_3_ci-pipeline.md` | **Marshall** | #3 (needs the e2e test to exist) | [x] |
| 5 | `11_shared_4_reconnection-and-persistence-e2e-coverage.md` | **Marshall** | #3, #4 | [x] |
| 6 | `11_client_2_visual-design-pass.md` | **Raj** | none (independent — pure CSS/markup, no new functionality) | [ ] |

Prompts 3 and 5 are explicitly authorized to fix real integration bugs they find, unlike `07_shared_1` —
Step 11's own process wording is "conduct acceptance tests; fix faults if found," not docs-only
reconciliation. Prompt 5 exists because a full audit after 3-4 landed found R6.1–R6.4 (disconnect/
reconnect) was never exercised end-to-end — unlike prompt 3's four bugs, this one's outcome (does the real
wiring actually work?) is genuinely unknown until the prompt runs — plus a match-persistence path that was
verified working by hand but never given permanent test coverage.

## Later steps

Steps 12 (final reverse-engineered diagram) and 13 (final javadoc) have not had prompts written yet.
