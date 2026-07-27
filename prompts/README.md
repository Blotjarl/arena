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

## Later steps

`docs/ProjectProcess.txt` step 7 (analyze the reverse-engineered diagram against Step 1's and the code,
iterate) is still outstanding, and Step 10 (controller/view layer) starts only once each track's own
Step 9 model work is done — see the implementation plan.
