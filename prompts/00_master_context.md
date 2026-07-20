# Prompt 00 — Master Context Document (MoT Prompt 0)

### CRITICAL DIRECTIVE ###
**CRITICAL: Load this document in full before executing any other prompt in this repository.** This is
the persistent knowledge base for the Arena project (Module of Thought Prompt 0). Every prompt that
follows — for Marshall's server track, Raj's client track, or En's api track — assumes you have read this
document and will refer back to it instead of re-deriving architecture, conventions, or requirements from
scratch. **This document contains no implementation instructions of its own.** It is context only. Do not
write code in response to this file alone — wait for a numbered prompt.

---

## 1. Domain Background & Theory

### 1.1 What Arena is
Arena is a browser-based, real-time, 1v1 multiplayer combat game — two players, each controlling one of
three fixed champions, fight in a single arena instance until one is eliminated, time runs out, or one
disconnects. The full authoritative source is `docs/ArenaSRS.pdf`; this section is a condensed orientation,
not a replacement for it.

**The single most important architectural fact about this system:** the game server is the sole source of
truth for every match-critical outcome (damage, cooldowns, win conditions). The client is a display and
input device only — it renders what the server sends and forwards input as requests, and never asserts an
outcome the server hasn't itself computed. Every prompt that touches `packages/client` must respect this;
every prompt that touches `packages/server` must enforce it.

### 1.2 MVC / MDD / OOP — non-negotiable, project-wide
The course requires this system to **exemplify** MVC, MDD, and OOP. Concretely, in this codebase that means:

- **MVC**: One reusable framework (`packages/shared/src/mvc`) — `Model`, `View`, `Controller`,
  `ModelEvent`, `ModelListener`, `AbstractModel`, `AbstractController` — realized identically in every
  subsystem, exactly as the course's Calculator/Account Manager examples reuse `mvc` across app packages.
  A `Model` never imports a `View` or `Controller`. A `View` reacts only to `ModelEvent`s via
  `modelChanged()`. A `Controller` is the only thing that touches both. There is no `JFrameView` — Arena
  has no desktop GUI — so each subsystem supplies its own concrete `View` (Socket.IO broadcaster on the
  server, React-backed classes on the client, HTTP response formatters on the api).
- **MDD**: `docs/01_class_list.md` and `docs/01_class_diagram.html` are the model. Code must not diverge
  from them without the model being updated first (or, after code exists, without a reverse-engineered
  diagram — Steps 6/12 — being produced to reconcile the two). Treat the class list as the spec; treat
  divergence between code and class list as a defect to resolve, not something to silently accept.
- **OOP**: encapsulation (state behind operations — e.g. `ParticipantState` is the only thing that mutates
  its own health/resource/cooldowns), inheritance (`Abstract*` base classes), polymorphism (`Model`/`View`/
  `Controller` interfaces have many independent realizations), abstraction (interfaces separate contract
  from implementation). Reference material: `docs/ooPierce.pdf`, `docs/introClassesAttr.pdf`,
  `docs/Model-View-Controller.pdf`.

### 1.3 Domain glossary (SRS 1.4, condensed)
| Term | Meaning |
|---|---|
| Champion | A selectable character with fixed stats and abilities (Korr, Vex, Rin — see 1.4 below). |
| Ability | A champion-specific action: a cooldown, a resource cost, one effect type (damage / heal / crowd control / positioning). |
| Cooldown | Minimum time between two uses of the same ability by the same player. |
| Crowd Control (CC) | An effect that temporarily prevents the target from moving or using abilities. |
| Tick | One simulation step of the server's authoritative loop — 20 per second. |
| Match | One instance of gameplay, champion selection through a win condition. |
| Matchmaking Queue | FIFO list of identified players waiting to be paired. |
| Disconnect Grace Period | 30s window a disconnected player's champion is held in place before forfeit. |

### 1.4 Champion roster (SRS Appendix B — authored by En, lives in `packages/shared/src/domain`)
| Champion | Role | Max HP | Notable abilities |
|---|---|---|---|
| Korr | Bruiser / Control | 180 | Crushing Blow (melee dmg), Shockwave Slam (stun), Iron Skin (self-heal), Bulwark Charge (gap-closer) |
| Vex | Ranged Burst Mage | 85 | Arcane Bolt (long-range dmg), Frost Lance (ranged root), Phase Step (blink) |
| Rin | Sustain Duelist | 130 | Rending Strike (melee dmg), Vital Siphon (self-heal), Swift Reposition (gap-closer/disengage) |

Every champion has at least one damage ability — there is no auto-attack, so a kit without one could never
win by elimination.

---

## 2. System Architecture Overview

### 2.1 Subsystems and ownership
Three independently deployable subsystems, plus a shared library, as an npm workspace monorepo:

| Package | Role | Owner |
|---|---|---|
| `packages/shared` | MVC framework, domain vocabulary, wire contract, exceptions | **Marshall** (framework/contract), **En** (champion/game-design content) |
| `packages/server` | Authoritative real-time game server (Node.js/TypeScript, Socket.IO) | **Marshall** |
| `packages/client` | Browser client (React/TypeScript) | **Raj** |
| `packages/api` | REST API + PostgreSQL persistence (Express/TypeScript) | **En** |

### 2.2 The model (do not re-derive — read these)
- **Textual class list** (every class, interface, attribute, operation, relationship, exception): `docs/01_class_list.md`
- **Visual UML diagram** (same content, rendered): `docs/01_class_diagram.html`

Every prompt that creates or modifies a class must match its entry in `01_class_list.md` exactly —
package, name, extends/implements, attributes, operations, and which exceptions it throws. If a prompt
needs to deviate from the class list, it must say so explicitly and the class list must be updated in the
same commit.

### 2.3 Communication topology
- **Client ↔ Server**: persistent WebSocket via Socket.IO. Payload shapes are defined once in
  `packages/shared/src/contract` and used by both sides — never hand-roll a duplicate shape.
- **Client ↔ API**: ordinary HTTP/REST (match history, leaderboard).
- **Server → API**: HTTP, one-directional, only for reporting a match's begin/end (`MatchReportingClient` →
  `InternalMatchController`). The server never writes to PostgreSQL directly — this keeps persistence
  failures off the hot path of match simulation (3.6.1 Reliability, R7.4).
- **API ↔ PostgreSQL**: via the `pg` driver, only from `packages/api`.

No other cross-subsystem coupling exists. If a prompt seems to need one, stop and flag it rather than
inventing a new channel.

---

## 3. Component Specifications (Summary)

Full detail is in `docs/01_class_list.md`. This is only an index so a session can orient without reading
the whole file:

- **shared/mvc** (7 types) — the framework itself.
- **shared/domain** (13 types) — Player, Champion, Ability, Position, ChampionRoster, Match,
  MatchParticipant, and enums (Team, MatchPhase, ConnectionStatus, EndReason, MatchResult, EffectType).
- **shared/contract** (17 types) — every WebSocket payload (SRS Appendix A) and REST DTO.
- **shared/exceptions** (16 types) — `ArenaError` and its subclasses, each traceable to an SRS requirement.
- **server** (15 types) — `MatchmakingQueue`, `MatchModel`, `ParticipantState`, `TickLoop`, five
  controllers, two broadcast views, `ServerMain`.
- **client** (13 types) — four models (incl. `InterpolationBuffer`), four controllers, the four SRS screens
  as Views, `ClientMain`.
- **api** (13 types) — three repositories, `PendingMatchCorrelator`, `LeaderboardEntry`, three controllers,
  three response views, `PgPool`, `ApiMain`.

---

## 4. Success Metrics & Baseline Requirements

### 4.1 Quantitative thresholds — hardwire these exactly, do not approximate
| Constant | Value | Source |
|---|---|---|
| Simulation tick rate | 20 ticks/second | R-P1 |
| State broadcast latency | within 1 tick (50ms) of a change | R-P2 |
| Default max concurrent matches | 50 (configurable) | R-P3 |
| REST response time (history/leaderboard) | < 1 second under normal load | R-P5 |
| Champion-selection time limit | 30 seconds | R3.4 |
| Disconnect grace period | 30 seconds | R6.4 |
| Match time limit | 5 minutes | R5.2 |
| Username max length | 24 characters, non-empty | R1.1 |
| Leaderboard minimum games (default) | 1 | R8.2 |
| Exchange-rate-style hardwired constants | none in this system (no currency conversion — do not port that pattern from the course's Account Manager example) | — |

### 4.2 Baseline requirements that must hold at every increment
- The server never trusts a client-reported position, damage amount, or outcome (2.1, R4.1).
- Every player action is validated against current authoritative state before any effect is applied;
  invalid actions are rejected without effect, not partially applied (3.6.2).
- A failure in one match (internal error) must not affect any other in-progress match (R5.4, 3.6.2) — this
  is why `TickLoop.onTick()` must catch and log per-match, not let one match's exception propagate.
- A failure in the persistence layer must not interrupt gameplay or lose an in-progress match's live state
  (3.6.1) — this is why the server reports to the API over HTTP, log-and-swallow on failure, rather than
  blocking on a database write.
- Server-side game logic (match state, tick loop, ability resolution, matchmaking) must be exercisable by
  automated tests **without a live network connection** (3.6.4) — this is why `ConnectionHandler` is a thin
  adapter kept separate from the `*Controller` classes it dispatches to.

---

## 5. Technical Constraints

- **R-D1**: TypeScript across all subsystems — client, server, api, shared. No JavaScript, no other language.
- **R-D2**: Socket.IO over WebSocket for all real-time communication, per the shared contract.
- **R-D3**: PostgreSQL (16) as the only persistent store.
- **R-D4**: Docker — each of server and api must build and run as an independent container image.
- **R-D5**: Jest for unit tests, Playwright for end-to-end tests, both wired into CI on every change.
- **R-D6**: This project's documentation (SRS) follows IEEE Std 830-1998 — don't introduce a conflicting
  documentation format for requirements-adjacent docs.
- **R-D7 / 2.4 Operating environment**: Node.js 20+, evergreen browsers (Chrome/Firefox/Edge/Safari,
  ECMAScript 2022, WebSocket support). Deployment target is Railway, but nothing in application code may
  depend on a Railway-specific feature (3.6.7 Portability) — containers must run identically with plain
  `docker run`.

---

## 6. Dependencies & Prerequisites

- **Runtime**: Node.js 20+, npm workspaces (monorepo — not a separate repo per package).
- **Current repository state** (check before assuming otherwise — this file does not self-update):
  `packages/` does not exist yet. Only `docs/` and `prompts/` exist. The root `package.json`,
  `tsconfig.base.json`, and workspace scaffolding have **not** been created — that is Step 2's job.
- **Key npm dependencies anticipated** (confirm/pin exact versions in the Step 2/3 Gradle-equivalent
  prompt rather than assuming here): `socket.io` + `socket.io-client`, `express`, `pg`, `react` +
  `react-dom`, `typescript`, `jest` + `ts-jest`, `@playwright/test`, `vitest`-or-`jest` for client (decide
  once, keep consistent).
- **External accounts/services**: GitHub repo `https://github.com/Blotjarl/arena` (git remote `origin`).
  Railway deployment is out of scope until the system is functionally complete locally via Docker (2.5).

---

## 7. System Features Reference (SRS 3.2, condensed)

| # | Feature | Priority | Primary owner | Requirement range |
|---|---|---|---|---|
| 3.2.1 | Player Identification | Essential | En (spec) / Marshall (server enforcement) | R1.1–R1.4 |
| 3.2.2 | Matchmaking Queue | Essential | Marshall | R2.1–R2.6 |
| 3.2.3 | Champion Selection | Essential | Marshall (logic), En (data), Raj (UI) | R3.1–R3.5 |
| 3.2.4 | Real-Time Combat | Essential | Marshall (logic), Raj (rendering) | R4.1–R4.7 |
| 3.2.5 | Match Win Conditions | Essential | Marshall | R5.1–R5.4 |
| 3.2.6 | Disconnect/Reconnect | Essential | Marshall | R6.1–R6.4 |
| 3.2.7 | Match History | Essential (recording) / Desired (view) | En | R7.1–R7.4 |
| 3.2.8 | Leaderboard | Desired | En | R8.1–R8.3 |

---

## 8. Anticipated Critical Checkpoints

Per MoT, these are pre-identified now, before implementation, because they carry real architectural risk.
Each will be marked `CRITICAL` in its own numbered prompt when we get there.

| Checkpoint | Risk | Mitigation |
|---|---|---|
| First `TickLoop` implementation | 20Hz timing drift, or one match's error crashing all matches | Per-match try/catch inside `onTick()`; isolated Jest test driving `tick()` directly with no timers/sockets |
| Matchmaking pairing race | Two simultaneous `queue:join` calls both matching the same third player | Single-threaded Node event loop protects in-process state, but the pairing method itself must be tested for double-pairing before any socket code exists |
| Disconnect/reconnect grace period | Timer leaks (grace period never cancelled on reconnect) or double-forfeit | Explicit test: reconnect just before and just after the 30s boundary |
| Server → API match reporting | Network failure mid-match silently loses persistence, or double-writes on retry | `PendingMatchCorrelator` must be idempotent per `matchId`; failures logged, never thrown into match simulation |
| Client interpolation vs. authoritative state | Client-side smoothing accidentally overwrites a server value | `InterpolationBuffer` must only ever produce a `Position` for rendering — verified by a test asserting it never mutates `ClientMatchModel` |
| Cross-package contract drift | `packages/shared/src/contract` changes without server and client updating together | Contract changes are Marshall's alone (Appendix C); any prompt touching the contract must be flagged and the affected server/client prompts regenerated together |

---

## 9. MoT Prompt Conventions — governs every future prompt

### 9.1 Formatting (unchanged from the course's Calculator/Account Manager examples)
Every prompt from here forward uses: **Sandwich Method** (critical requirements at the start and end),
**Attention Anchoring** (`MANDATORY`/`CRITICAL` markers), **Visual Emphasis** (bold, code blocks),
**Clear Delimiters** (`###` headers), **Selective Context** (only what that component needs — this master
document supplies the rest).

### 9.2 One prompt per component
Each prompt implements exactly one class/interface/component, matching one entry in
`docs/01_class_list.md` — mirroring "a separate prompt for each Java class." Multi-class prompts are only
used for the initial skeleton pass (Step 2), never for implementation increments (Steps 8–10).

### 9.3 File naming (in `prompts/`)
```
NN_<track>_<seq>_<component-name>.md
```
- `NN` = the `docs/ProjectProcess.txt` step number (01–13) the prompt belongs to.
- `<track>` = `shared`, `server`, `client`, or `api`.
- `<seq>` = sequence number within that step+track (independent per track — tracks run in parallel).
- `<component-name>` = kebab-case class/component name.

Example: `03_server_2_matchmaking-queue.md`, `03_client_1_client-identity-model.md`. This lets three
people execute their own tracks concurrently without filename collisions or false ordering dependencies.
A `prompts/README.md` index (mirroring the course examples) will be added and kept current as each batch
of prompts is generated — it is the map of what exists and in what order; this master context is not
re-edited per prompt.

### 9.4 Git workflow — MANDATORY, every prompt
- Work on a branch named `<track>` (`server`, `client`, `api`, or `shared`), branched from `main`. Do not
  commit implementation work directly to `main`.
- **Every prompt concludes with**: verify (see 9.5), `git add` the specific files changed (never `-A`
  blindly), `git commit` with a message naming the process step and component, then `git push` to the
  matching remote branch.
- Merge a track branch into `main` via PR at the end of each `ProjectProcess.txt` step that track
  completes — not after every single prompt. `packages/shared` is the exception: merge it to `main`
  promptly, since server/client/api all depend on it and a stale shared branch blocks everyone.
- This produces a real branch/commit graph for the final presentation's git "Network" screenshot
  (`projectDescription.txt` submission item 10) — don't squash it away.

### 9.5 Verification — MANDATORY, before every commit
- TypeScript compiles (`tsc --noEmit` or equivalent for the affected package).
- If the component has tests specified in its prompt, they pass.
- No package boundary violation (2.3 dependency table — e.g. `model` code must never import from `view`
  or `controller`).
- The class as implemented still matches its `docs/01_class_list.md` entry; if it doesn't, update the
  class list in the same commit and say so in the commit message.

### 9.6 Session behavior
Load this document, then the one numbered prompt you were given. Do not implement adjacent classes "while
you're in there" — scope creep across a monorepo with three parallel owners causes merge conflicts between
people who never talked to each other. If a prompt's instructions conflict with this document, this
document wins; stop and flag the conflict rather than guessing.

---

## 10. Process State

Per `docs/ProjectProcess.txt`:

- **Step 1 (class diagram)** — done: `docs/01_class_list.md`, `docs/01_class_diagram.html`.
- **Step 2 (skeleton from the diagram)** — not started. Next up: project/workspace structure, then the
  `shared` package skeleton (model-equivalent must be relatively complete before controller/view), per
  step 2's own ordering instruction.
- **Steps 3–13** — not started.

This section is a pointer, not a ledger — for the authoritative current state, check `git log` and
`prompts/README.md` (once it exists) rather than trusting this file to be current for long.

---

### CRITICAL CLOSING REQUIREMENT ###
**MANDATORY: Every prompt in `prompts/` — for every track, for the rest of this project — begins with an
explicit instruction to load this file first, and must not contradict it.** If you are a fresh Claude Code
session reading this because a prompt told you to: read this whole document, then read `docs/01_class_list.md`
for the specific class(es) your prompt targets, then execute your prompt. Do not skip either.
