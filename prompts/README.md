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
| 1 | `03_shared_1_tsdoc-and-contingency-review.md` | **Marshall** | `packages/shared` — establishes the TSDoc convention | none | [ ] |
| 2 | `03_server_1_tsdoc-and-contingency-review.md` | **Marshall** | `packages/server` | reads 1's §1 only | [ ] |
| 3 | `03_client_1_tsdoc-and-contingency-review.md` | **Raj** | `packages/client` | reads 1's §1 only | [ ] |
| 4 | `03_api_1_tsdoc-and-contingency-review.md` | **En** | `packages/api` | reads 1's §1 only | [ ] |
| 5 | `03_shared_2_typedoc-generation.md` | **Marshall** | TypeDoc setup + initial generation, `docs/api/` | 1, 2, 3, and 4 all merged | [ ] |

If any of prompts 1–4 finds a genuine gap in the exception set (rare — see each prompt's §3), it adds a
new exception class to `packages/shared/src/exceptions/` directly as part of its own commit rather than
blocking on a separate prompt; this is a small enough addition to be low-conflict even with two tracks
touching `shared` the same day.

## Later steps

Not yet generated. `docs/ProjectProcess.txt` steps 6–13 will get their own prompt batches once Steps 3–5
are complete and reviewed.
