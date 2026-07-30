# Step 1 — Class List (UML Class Diagram, Textual Form)

**Process step:** `docs/ProjectProcess.txt` step 1. This document is the model — MDD treats it as the
source of truth that Step 2 (skeleton code) and the reverse-engineered diagrams in Steps 6/12 must stay
consistent with. The actual UML diagram (boxes/arrows) is a later deliverable; this is its textual
equivalent: every class/interface/abstract class, its package, its generalization/realization
relationships, its first-cut attributes and operations (including at least one constructor and one
`main`-equivalent per subsystem), and the exceptions each operation can throw.

## How MVC maps onto this monorepo

Arena is three independently deployable subsystems (SRS 2.1) plus a shared library, implemented as an
npm workspace monorepo:

| Workspace package | Subsystem | Owner (SRS Appendix C / authorship table) |
|---|---|---|
| `packages/shared` | MVC framework, domain vocabulary, wire contract, exceptions | Marshall (framework/contract), En (champion/game-design content) — joint |
| `packages/server` | Authoritative real-time game server | **Marshall** |
| `packages/client` | React browser client | **Raj** |
| `packages/api` | REST API + PostgreSQL persistence | **En** |

Each of `server`, `client`, and `api` is internally packaged the way the course examples package a single
Java program: `src/model`, `src/view`, `src/controller` (plus `src/util` where needed), per
`ProjectProcess.txt`'s "packaged (model, view, controller)" instruction. `packages/shared/src/mvc` plays
exactly the role the `mvc` package played in the Calculator example (Model/View/Controller/ModelEvent/
ModelListener/AbstractModel/AbstractController) — one framework, reused by all three subsystems instead
of by one `calculator` package. This is the MoT master-context decision that every later prompt must
respect: **application code never redefines these seven types; it imports them from `shared/mvc`.**

This satisfies OOP (encapsulation of state behind operations, inheritance via the `Abstract*` classes,
polymorphism via the `Model`/`View`/`Controller` interfaces having many independent realizations,
abstraction via interfaces separating contract from implementation) and MVC (push notification: a
`Model` never imports a `View` or `Controller`; a `View` reacts to `ModelEvent`s; a `Controller` is the
only thing that touches both).

---

## 1. `packages/shared/src/mvc` — the reusable MVC framework

*(Owner: Marshall. Adapted directly from the John Hunt Calculator pattern used in the course examples,
generic instead of Java-concrete.)*

| Type | Kind | Extends / Implements | Attributes | Operations |
|---|---|---|---|---|
| `Model` | interface | — | — | `notifyChanged(event: ModelEvent): void` |
| `Controller<M extends Model, V extends View<M, any>>` | interface | — | — | `getModel(): M`; `setModel(model: M): void`; `getView(): V`; `setView(view: V): void` |
| `View<M extends Model, C extends Controller<M, any>>` | interface | — | — | `getModel(): M`; `setModel(model: M): void`; `getController(): C`; `setController(controller: C): void` |
| `ModelEvent<T = unknown>` | class | — | `readonly source: Model`; `readonly type: string`; `readonly payload: T`; `readonly timestamp: number` | `constructor(source: Model, type: string, payload: T)` |
| `ModelListener` | interface | — | — | `modelChanged(event: ModelEvent): void` |
| `AbstractModel` | abstract class | implements `Model` | `private listeners: ModelListener[]` | `constructor()`; `addModelListener(l: ModelListener): void`; `removeModelListener(l: ModelListener): void`; `notifyChanged(event: ModelEvent): void` (clones listener list before iterating, mirrors the Calculator example's `ArrayList.clone()` safeguard) |
| `AbstractController<M extends Model, V extends View<M, any>>` | abstract class | implements `Controller<M,V>` | `protected model: M`; `protected view: V` | `constructor(model: M, view: V)`; `getModel(): M`; `setModel(model: M): void`; `getView(): V`; `setView(view: V): void`; `abstract operation(action: string, payload?: unknown): void` (the Calculator/AccountManager dispatcher pattern — concrete controllers implement this with a switch/if-else over the action string) |

There is deliberately **no `JFrameView` equivalent** — Arena has no desktop GUI. Each subsystem supplies
its own concrete `View` realizations appropriate to its transport (Socket.IO emission on the server, React
re-render on the client, HTTP response formatting on the API), all still implementing `View` and, where
they react to push events, `ModelListener`. This is the single biggest adaptation from the taught pattern
and should be called out explicitly in the final documentation deliverable.

---

## 2. `packages/shared/src/domain` — shared domain vocabulary

*(Owner: En for champion/game-design content; Marshall for `Player`/`Match`/`MatchParticipant` shapes
used by matchmaking and persistence alike.)*

| Type | Kind | Attributes | Operations |
|---|---|---|---|
| `PlayerId`, `MatchId`, `ChampionId` | plain `string` type aliases (`ids.ts`) — not branded; simplicity was chosen over nominal typing for Step 2 | — | — |
| `Team` | enum | `A`, `B` | — |
| `MatchPhase` | enum | `CHAMPION_SELECT`, `ACTIVE`, `ENDED` | — |
| `ConnectionStatus` | enum | `CONNECTED`, `DISCONNECTED` | — |
| `EndReason` | enum | `ELIMINATION`, `TIME_LIMIT`, `DISCONNECT_FORFEIT`, `SELECTION_TIMEOUT` (R5.3, R-DB3) | — |
| `MatchResult` | enum | `WIN`, `LOSS`, `DRAW` (R-DB3) | — |
| `EffectType` | enum | `DAMAGE`, `HEAL`, `CROWD_CONTROL`, `POSITIONING` (SRS 1.4 definitions) | — |
| `ARENA_WIDTH`, `ARENA_HEIGHT` | `const number` (`Arena.ts`, Step 11) | `720` x `480` (Step 11 corrections below) — the arena's game-logic coordinate bounds, not pixels | — |
| `ArenaObstacle` | interface (`Arena.ts`, Step 11) | `x: number`; `y: number`; `width: number`; `height: number` | — |
| `ARENA_OBSTACLES` | `const readonly ArenaObstacle[]` (`Arena.ts`, Step 11) | 3 fixed rectangles in the arena's middle third, mirrored left-right (Step 11 corrections below) | — |
| `SKILLSHOT_HIT_RADIUS` | `const number` (`Arena.ts`, Step 11) | `40` — tunable aim-forgiveness radius for skillshot hit resolution (Step 11 correction below) | — |
| `isWithinObstacle` | free function (`Arena.ts`, Step 11) | — | `(x: number, y: number): boolean` — true if the point falls within (or on the boundary of) any `ARENA_OBSTACLES` rectangle |
| `segmentCrossesObstacle` | free function (`Arena.ts`, Step 11) | — | `(x1, y1, x2, y2: number): boolean` — true if the line segment crosses any `ARENA_OBSTACLES` rectangle (Liang–Barsky clipping); used to block ability line-of-sight (Step 11 correction below) |
| `Position` | class | `x: number`; `y: number` | `constructor(x: number, y: number)`; `distanceTo(other: Position): number` |
| `Ability` | class | `id: string`; `name: string`; `cooldownSeconds: number`; `resourceCost: number`; `range: number`; `effectType: EffectType`; `magnitude: number`; `description: string` (Step 11 correction below) | `constructor(id, name, cooldownSeconds, resourceCost, range, effectType, magnitude, description)` |
| `Champion` | class | `id: ChampionId`; `name: string`; `role: string`; `maxHealth: number`; `maxResource: number`; `resourceRegenRate: number`; `moveSpeed: number`; `abilities: Ability[]` | `constructor(...)`; `getAbility(abilityId: string): Ability` — **throws** `InvalidChampionSelectionError` if not found |
| `ChampionRoster` | class | `private static readonly champions: Champion[]` (Korr, Vex, Rin — SRS Appendix B) | `static getAll(): Champion[]`; `static getById(id: ChampionId): Champion` — **throws** `InvalidChampionSelectionError` |
| `Player` | class | `id: PlayerId`; `username: string`; `createdAt: Date` | `constructor(id, username, createdAt)` |
| `Match` | class (historical record shape) | `id: MatchId`; `endReason: EndReason`; `winningTeam: Team \| null`; `durationMs: number`; `endedAt: Date` | `constructor(...)` |
| `MatchParticipant` | class (historical record shape) | `matchId: MatchId`; `playerId: PlayerId`; `team: Team`; `championId: ChampionId`; `result: MatchResult` | `constructor(...)` |

**Design note on `ChampionRoster`'s placement:** SRS Appendix C's AI-use-plan table associates "champion
roster" content with En's `packages/api` work organizationally. Architecturally, though, both the server
(combat resolution, R4.2) and the client (Champion Select screen, R3.1) need the roster *synchronously*,
with no network round trip — the same reasoning behind the Account Manager example's hardwired
`CurrencyConstants`. So `ChampionRoster` is data **authored by En** but physically located in
`shared/domain` (like a hardwired constants class), while `packages/api`'s persistence layer (also En's)
is the separate concern of recording match *results*, not defining champion *data*. Flag this for En so
the divergence from the AI-use-plan table's literal package name is understood as intentional.

> **Step 11 correction — real bug found by manually playing a match (`11_server_2`)**: `ARENA_WIDTH`/
> `ARENA_HEIGHT` (row above) are new — before this correction, `ParticipantState.move()` (§5a) applied
> speed/deltaSeconds math with zero clamping, so a player could move infinitely far in any direction, and
> `MatchModel`'s constructor (§5a) gave both `ParticipantState`s the same default `Position(0, 0)`, so both
> participants spawned stacked on top of each other. Both are real gameplay gaps a unit test alone would
> never surface (every existing test drove `move()`/the constructor directly, never rendered the result).
> `400` was chosen to match the scale every champion's `moveSpeed` and every ability's `range` in
> `ChampionRoster` was already implicitly tuned against (Vex's Arcane Bolt range 600 comfortably exceeds a
> 400x400 arena's ~565.7 diagonal; a full-speed sprint at Vex's 220 moveSpeed crosses the whole width in
> under 2 seconds) — it does not change any existing game-logic values, only adds a boundary around them.

> **Step 11 correction (`11_server_3`)**: `ARENA_WIDTH` widened from `400` to `600` (1.5x) per this prompt's
> request for a *wider*, not bigger-square, arena — `ARENA_HEIGHT` stays `400`. Re-checked the same balance
> the correction above already verified once: the new diagonal is `√(600² + 400²) ≈ 721.1`, so Vex's
> Arcane Bolt (range 600) no longer reaches every corner-to-corner case — a reasonable, even welcome
> consequence of a bigger space, not a regression to route around. A full-speed sprint across the new width
> still takes a reasonable few seconds (Korr 180 moveSpeed: 3.33s; Rin 200: 3.00s; Vex 220: 2.73s), not
> instant or a full minute. `MatchModel`'s spawn formula (`SPAWN_WALL_MARGIN` and
> `ARENA_WIDTH - SPAWN_WALL_MARGIN`, §5a) is already width-relative and needed no code change, only
> re-verification that the two spawns remain distinct and outside every obstacle (below) at the new width.
>
> The same prompt adds three new exports to `Arena.ts` (rows above): the `ArenaObstacle` shape, a fixed
> `ARENA_OBSTACLES` list of three static rectangles, and `isWithinObstacle(x, y)`, a pure helper checking a
> point against all of them. The three obstacles sit in the arena's middle third (`x` in roughly
> `[205, 395]`), well clear of both spawn points (`(50, 200)` and `(550, 200)`, at least 150 units from the
> nearest obstacle edge) and of the side walls, and are mirrored left-right around the arena's horizontal
> center (`x = 300`) so neither spawn has a positional advantage — the two flanking pillars are exact mirror
> images of each other, and the top-center block is self-mirrored. None spans the arena's full width or
> height, and a clear ~90-unit gap is kept around dead-center so a straight path always exists between the
> pillars as well as around every obstacle. **Scope decision**: obstacles block movement only, not ability
> range/targeting or line of sight — `MatchModel.submitAbility`'s existing distance-based range check (§5a)
> is unaffected by this prompt; a genuinely bigger "obstacles affect abilities too" feature is left for a
> later prompt.
>
> `ParticipantState.move()` (§5a) now checks the wall-clamped resulting position against `ARENA_OBSTACLES`
> after the existing clamp math: if it would land inside one, the movement is rejected outright for that
> tick (participant stays at their pre-move position), the same way an out-of-bounds position is prevented
> rather than allowed and corrected after the fact — a simple reject-the-whole-move approach, not an
> axis-separated "slide along the obstacle" response. This does not change `move()`'s signature or its
> thrown exceptions; a blocked move is silent, matching the existing pattern for other movement no-ops.

> **Step 11 correction (`11_cross_1`)**: `ARENA_WIDTH`/`ARENA_HEIGHT` widened a further 20% (`600`x`400` →
> `720`x`480`), preserving the same 1.5:1 ratio. New diagonal `√(720² + 480²) ≈ 865.3` — Arcane Bolt's `600`
> range reaches proportionally less of it than before, restating the same "welcome consequence, not a
> regression" conclusion `11_server_3` already reached once. Sprint-across time at the new width: Korr
> (180 moveSpeed) 4.0s, Rin (200) 3.6s, Vex (220) 3.27s — still a reasonable few seconds. `ARENA_OBSTACLES`
> rescaled by the same 1.2x factor, keeping the layout proportionally identical (still mirrored around the
> new center `x = 360`, still self-mirrored top block); the two (now-wider) spawns `(50, 240)` and
> `(670, 240)` remain well clear of every obstacle (196 units to the nearest edge, more clearance than
> before, not less).
>
> The same prompt adds `segmentCrossesObstacle(x1, y1, x2, y2)` (Liang–Barsky segment-vs-rectangle
> clipping) and reverses `11_server_3`'s "movement only" scope decision — obstacles now block ability
> line-of-sight too (§5a, `MatchModel.submitAbility`'s new skillshot targeting, described below), the
> follow-up `11_server_3` explicitly anticipated. Also adds `SKILLSHOT_HIT_RADIUS` (`40`), the tunable
> aim-forgiveness radius the same skillshot targeting uses.
>
> Also adds a `description: string` field to `Ability` (row above) — flavor text shown as a hover tooltip
> in the client (Champion Select and the match HUD), purely cosmetic, never read by any game-logic code.

---

## 3. `packages/shared/src/contract` — the WebSocket + REST wire contract

*(Owner: Marshall, per SRS Appendix C. Plain data shapes only — no behavior. Corresponds to SRS Appendix
A almost 1:1.)*

| Type | Direction | Fields |
|---|---|---|
| `IdentifyPayload` | client→server | `playerId: PlayerId`; `username: string` |
| `QueueJoinedPayload` | server→client | `position: number` |
| `QueueCancelledPayload` | server→client | — |
| `MatchFoundPayload` | server→client | `matchId: MatchId`; `team: Team`; `opponentUsername: string`; `roster: Champion[]` |
| `ChampionSelectedPayload` | server→client | `matchId: MatchId`; `playerId: PlayerId`; `championId: ChampionId`; `bothSelected: boolean` |
| `MatchStartPayload` | server→client | `matchId: MatchId`; `initialState: MatchStatePayload` |
| `ParticipantSnapshot` | (embedded) | `playerId: PlayerId`; `team: Team`; `championId: ChampionId`; `position: Position`; `health: number`; `resource: number`; `cooldownsRemaining: Record<string, number>`; `crowdControlled: boolean`; `connectionStatus: ConnectionStatus`; `alive: boolean` |
| `MatchStatePayload` | server→client | `matchId: MatchId`; `tick: number`; `participants: [ParticipantSnapshot, ParticipantSnapshot]` |
| `MovementInput` | client→server (`match:action`) | `dx: number`; `dy: number` |
| `AbilityUseRequest` | client→server (`match:action`) | `abilityId: string`; `targetPlayerId?: PlayerId`; `targetPosition?: Position` |
| `MatchEndPayload` | server→client | `matchId: MatchId`; `reason: EndReason`; `winningTeam: Team \| null`; `durationMs: number` |
| `PlayerDisconnectedPayload` | server→client | `playerId: PlayerId`; `gracePeriodSeconds: number` |
| `PlayerReconnectedPayload` | server→client | `playerId: PlayerId` |
| `ErrorPayload` | server→client | `code: string`; `message: string` |
| `MatchHistoryEntryDTO` | server→client (REST) | `matchId, opponentUsername, championId, result, endReason, durationMs, endedAt` |
| `LeaderboardEntryDTO` | server→client (REST) | `username, wins, losses, draws, gamesPlayed, winRate` |
| `ChampionWinRateDTO` | server→client (REST) | `championId, gamesPlayed, winRate` |
| `MatchBeginReportDTO` | server→api (internal HTTP, `MatchReportingClient.reportMatchBegin`) | `matchId: MatchId`; `participants: { playerId: PlayerId; username: string; team: Team; championId: ChampionId }[]` |
| `MatchEndReportDTO` | server→api (internal HTTP, `MatchReportingClient.reportMatchEnd`) | `matchId: MatchId`; `endReason: EndReason`; `winningTeam: Team \| null`; `durationMs: number`; `endedAt: string` (ISO-8601) |

Every named Socket.IO event in SRS Appendix A (`identify`, `queue:join`, `queue:cancel`,
`champion:select`, `match:action`, `match:reconnect`, `queue:joined`, `queue:cancelled`, `match:found`,
`champion:selected`, `match:start`, `match:state`, `match:end`, `match:player_disconnected`,
`match:player_reconnected`, `error`) has exactly one payload type above. This table **is** the versioned
contract referenced by SRS 1.4 and R-D2 — Step 2's skeleton prompt will generate this file byte-for-byte
from this table.

**Step 10 correction (`packages/shared/src/contract/dto.ts`)**: `MatchBeginReportDTO` and
`MatchEndReportDTO` are new types, not in the original Step-1/3 sketch of this table, added when
`MatchReportingClient` (§5b) was actually implemented. §5b originally sketched `reportMatchBegin`/
`reportMatchEnd` as taking `MatchParticipant[]`/an inline `{...}` outcome object directly, but
`MatchParticipant` requires a `result: MatchResult` that doesn't exist yet at match-begin time, and an
untyped outcome object left the server↔api wire shape unversioned. `MatchBeginReportDTO.participants` also
carries `username` alongside the transient client-generated `playerId` — `PendingMatchCorrelator`/
`InternalMatchController` (§7a/§7b) need it to resolve each participant's canonical `players.id` via
`PlayerRepository.findOrCreateByUsername` before persisting, since `match_participants.player_id` has a
foreign key to `players(id)` that the transient `playerId` alone can never satisfy.

---

## 4. `packages/shared/src/exceptions` — the initial exception set

*(Owner: Marshall for the base + server-side exceptions; En for persistence-side. All extend a common
base so the WebSocket `error` event and REST error responses can carry a machine-readable `code`.)*

| Exception | Extends | Thrown by (operation) | SRS ref |
|---|---|---|---|
| `ArenaError` | `Error` | — (abstract base; `readonly code: string`) | — |
| `InvalidUsernameError` | `ArenaError` | `PlayerIdentifyController.operation('identify')` | R1.1 |
| `UnidentifiedConnectionError` | `ArenaError` | `ConnectionHandler` dispatch guard, any message pre-identify | R1.4 |
| `AlreadyQueuedError` | `ArenaError` | `MatchmakingQueue.join()` | R2.2 |
| `NotQueuedError` | `ArenaError` | `MatchmakingQueue.cancel()` | R2.3 |
| `InvalidChampionSelectionError` | `ArenaError` | `MatchModel.selectChampion()`, `Champion.getAbility()`, `ChampionRoster.getById()` | R3.2 |
| `SelectionWindowExpiredError` | `ArenaError` | `MatchModel.selectChampion()` after the 30s window | R3.4 |
| `InvalidMatchPhaseError` | `ArenaError` | any `MatchModel` operation called out of phase (e.g. combat action during Champion Select) | guards R3–R5 |
| `AbilityOnCooldownError` | `ArenaError` | `ParticipantState.useAbility()` | R4.2 |
| `InsufficientResourceError` | `ArenaError` | `ParticipantState.useAbility()` | R4.2 |
| `ActorIncapacitatedError` | `ArenaError` | `ParticipantState.useAbility()`, `.move()` (dead or crowd-controlled) | R4.2, R6.1 |
| `TargetOutOfRangeError` | `ArenaError` | Defined but never thrown by the current implementation — see Step 10 correction below | R4.2 |
| `GracePeriodExpiredError` | `ArenaError` | `MatchModel.reconnect()` | R6.4 |
| `PlayerNotFoundError` | `ArenaError` | `PlayerRepository` lookups | general |
| `PersistenceError` | `ArenaError` | any `*Repository` method | R7.4, R-DB4 |
| `ValidationError` | `ArenaError` | REST controllers, request body validation | 3.6.2 |

`packages/shared/src/util/NotImplementedError.ts` (extends `Error`, not `ArenaError`) is the Step-3
scaffolding exception every stub method throws so the skeleton compiles before implementations exist —
not a domain exception.

**Step 10 correction**: contrary to this file's original prediction, `NotImplementedError` **does** still
appear in the final Steps 9–10 code, in two legitimate, permanent (not scaffolding-leftover) roles: (1) the
three `packages/api` REST controllers' unused `AbstractController.operation()` override, since routing goes
through Express route handlers, not `operation()` (`LeaderboardController.ts`, `MatchHistoryController.ts`,
`InternalMatchController.ts`); and (2) `getController()`/`setController()` on the two server broadcast
views (`MatchmakingBroadcastView`, `MatchBroadcastView`, §5c), which are pure observers with no paired
controller. Both are "this method is structurally required by an interface/base class but has no
meaningful implementation for this concrete class" — a real, permanent use, not dead scaffolding.

**Step 10 correction**: `TargetOutOfRangeError` (row above) is defined and exported but never actually
thrown anywhere in the current implementation. `MatchModel.submitAbility()` (§5a) does compute a
caster→target distance and compare it to `ability.range`, but on failure it silently `return`s rather than
throwing — consistent with R4's "silently ignores" behavior for all per-ability validation failures
(unknown ability, cooldown, insufficient resource, incapacitation, out-of-range target alike), not with
this table's original "throws" framing. The exception class itself is harmless dead code; nothing needs to
change in `MatchModel`, since silent-ignore is the actually-specified behavior.

---

## 5. `packages/server` (Marshall) — the authoritative game server

### 5a. `server/model`

| Class | Extends/Implements | Attributes | Operations (throws) |
|---|---|---|---|
| `QueueEntry` | — | `playerId: PlayerId`; `username: string`; `joinedAt: number` | `constructor(playerId, username, joinedAt)` |
| `MatchmakingQueue` | `extends AbstractModel` | `private entries: QueueEntry[]`; `private activeMatchCount: number`; `private readonly maxConcurrentMatches: number`; `private activeParticipants: Set<PlayerId>` (10_server_10 — see correction below) | `constructor(maxConcurrentMatches: number)`; `join(player: Player): number` — **throws** `AlreadyQueuedError` (R2.1, R2.2); `cancel(playerId: PlayerId): void` — **throws** `NotQueuedError` (R2.3); `tryPairNext(): [QueueEntry, QueueEntry] \| null` (R2.4, R2.5); `releaseMatch(playerIds: [PlayerId, PlayerId]): void` (10_server_10 — see correction below); `size(): number` |
| `ParticipantState` | — | `playerId: PlayerId`; `team: Team`; `champion: Champion \| null`; `position: Position`; `health: number`; `resource: number`; `cooldowns: Map<string, number>`; `crowdControlledUntil: number`; `connectionStatus: ConnectionStatus`; `disconnectedAt: number \| null` | `constructor(playerId, team)`; `applyDamage(amount: number): void`; `applyHeal(amount: number): void`; `applyCrowdControl(durationMs: number, now: number): void`; `regenerateResource(deltaSeconds: number): void`; `canUseAbility(abilityId: string, now: number): boolean`; `useAbility(ability: Ability, now: number): void` — **throws** `AbilityOnCooldownError`, `InsufficientResourceError`, `ActorIncapacitatedError` (R4.2); `move(direction: MovementInput, deltaSeconds: number, now: number): void` — **throws** `ActorIncapacitatedError`; `isAlive(): boolean`; `toSnapshot(now: number): ParticipantSnapshot` |
| `MatchModel` | `extends AbstractModel` | `readonly id: MatchId`; `phase: MatchPhase`; `private participants: [ParticipantState, ParticipantState]`; `championSelectDeadline: number`; `startedAt: number \| null`; `endedAt: number \| null`; `endReason: EndReason \| null`; `winningTeam: Team \| null`; `private tickCount = 0` (broadcast tick counter, not a timestamp); `private pendingMoves: Map<PlayerId, {dx, dy}>` (each participant's latest unapplied movement input, applied once per `tick()`) | `constructor(id: MatchId, players: [Player, Player])`; `selectChampion(playerId: PlayerId, championId: ChampionId): void` — **throws** `InvalidChampionSelectionError`, `SelectionWindowExpiredError`, `InvalidMatchPhaseError` (R3.2–R3.5); `submitMove(playerId: PlayerId, input: MovementInput): void` — **throws** `InvalidMatchPhaseError` (R4.1); `submitAbility(playerId: string, req: { abilityId: string; targetPlayerId?: string }): void` — **throws** `InvalidMatchPhaseError` (invalid ability attempts are otherwise swallowed per R4's "silently ignores"); `tick(deltaSeconds: number): void` (R4.3–R4.6, calls `notifyChanged` with a `state` `ModelEvent`); `checkWinConditions(): EndReason \| null` (R5.1, R5.2); `disconnect(playerId: PlayerId): void` (R6.1, R6.2); `reconnect(playerId: PlayerId): void` — **throws** `GracePeriodExpiredError` (R6.3); `snapshot(): MatchStatePayload` |
| `TickLoop` | — | `private readonly tickRateHz = 20`; `private matches: Map<MatchId, MatchModel>`; `private handle: NodeJS.Timeout \| null` | `constructor(tickRateHz?: number)`; `register(match: MatchModel): void`; `unregister(matchId: MatchId): void`; `start(): void`; `stop(): void`; `private onTick(): void` (R-P1 — iterates all registered matches, calls `tick()` on each inside a try/catch **per match** so one match's internal error cannot affect another, satisfying R5.4 / 3.6.2) |

**Step 9 correction**: `applyCrowdControl`, `move`, and `toSnapshot` gained a `now: number` parameter
during implementation — all three need the simulation clock to compute or compare against time-based state
(crowd-control expiry, remaining cooldowns), and `useAbility`/`canUseAbility` already established that
pattern.

**Step 10 correction**: `MatchModel.participants` is `private`, not the plain attribute this table originally
implied, and the class carries two further undocumented private attributes (`tickCount`, `pendingMoves`) —
now added to the row above. Also, `submitAbility`'s real parameter was the narrower inline
`{ abilityId: string; targetPlayerId?: string }`, not the full shared `AbilityUseRequest` this table
originally sketched — the implementation never read `AbilityUseRequest.targetPosition` at all. See this
prompt's closing summary for why that specific gap was flagged as a real (not just documentation) issue: it
made any `POSITIONING`-effect ability invoked without a `targetPlayerId` (i.e. every self-directed
reposition, such as Vex's Phase Step) resolve its own target to itself and therefore move nowhere. **Fixed
for real in the Step 11 (`11_cross_1`) correction below** — `submitAbility` now takes and reads
`targetPosition` too.

> **Step 11 correction — real bug found by end-to-end acceptance testing**: `tick()`'s implementation had
> silently diverged from this table's own `pendingMoves` description above ("applied once per `tick()`") —
> a submitted movement input was never removed from `pendingMoves` after being applied, so it kept being
> re-applied on every subsequent tick forever, not just the next one. Invisible to every prior unit test
> (each one only ever calls `tick()` once after a single `submitMove()`), it surfaced immediately in real
> end-to-end play: `MatchHUDScreen`'s movement controls are plain discrete `onClick` buttons with no
> press/hold semantics and no "stop" control that could ever submit `{dx:0, dy:0}`, so a single accidental
> click on a movement button left that participant walking in a straight line, uncontrollably, at full move
> speed, for the rest of the match. Fixed by deleting the participant's `pendingMoves` entry immediately
> after (attempting to) apply it each tick, regardless of success — bringing the implementation back in
> line with what this table already said it should do.

> **Step 11 correction — real bug found by end-to-end acceptance testing (`11_server_2`)**: two real
> gameplay gaps, both invisible to every prior unit test since none of them ever rendered a match or moved
> a participant more than once. First, `ParticipantState.move()`'s resulting position is now clamped to
> `[0, ARENA_WIDTH]` x `[0, ARENA_HEIGHT]` (§2's new constants) after the existing speed/deltaSeconds math
> — previously unbounded, so a player could walk off the edge of whatever arena the client draws and never
> stop. Second, `MatchModel`'s constructor now assigns each `ParticipantState` a distinct spawn `Position`
> on opposite sides of the arena (`(SPAWN_WALL_MARGIN, ARENA_HEIGHT / 2)` and
> `(ARENA_WIDTH - SPAWN_WALL_MARGIN, ARENA_HEIGHT / 2)`) instead of leaving both at `ParticipantState`'s own
> default `Position(0, 0)` — previously both participants spawned stacked on top of each other. Neither
> change alters `ParticipantState`'s or `MatchModel`'s constructor signature.

> **Step 11 correction (`11_cross_1`)**: `ParticipantState.move()`'s `direction` vector is now normalized to
> unit length *inside* `move()` itself, before being scaled by speed — previously an unnormalized diagonal
> input like `{dx:-1,dy:-1}` (magnitude `√2`) moved ~41% faster than a cardinal direction, and nothing
> stopped a client from sending an arbitrarily large magnitude for an outright speed hack. Normalizing
> server-side (not trusting the client to pre-normalize) is the only way this is actually enforced (master
> context §1.1). A zero-magnitude input is a guarded no-op, not a division-by-zero.
>
> Separately, `MatchModel.submitAbility` (§5a) is substantially reworked: `HEAL` stays self-targeted and
> instant, but `DAMAGE`, `CROWD_CONTROL`, and `POSITIONING` are now all "skillshots" resolved from
> `AbilityUseRequest.targetPosition` (the shared contract type already had this field — see §3's Step 10
> correction — but nothing ever populated or read it until now) instead of `targetPlayerId`. For
> `DAMAGE`/`CROWD_CONTROL`, a hit requires three independent checks against the *real* opponent — in range,
> aim-aligned within `SKILLSHOT_HIT_RADIUS` of the cast ray, and unobstructed line of sight
> (`segmentCrossesObstacle`, §2) — any miss still consumes cooldown/resource, a deliberate "whiffed cast".
> **This finally fixes the `POSITIONING`-is-a-no-op bug this table flagged back at the Step 10 correction
> above**: giving `POSITIONING` abilities a real aimed destination (`caster.position + direction *
> ability.range`, wall-clamped, rejected outright if the path crosses an obstacle) means Bulwark Charge,
> Phase Step, and Swift Reposition actually move the caster for the first time since they were added.

> **Step 10 correction (`10_server_10`)**: `MatchmakingQueue.join()`'s own doc comment always said it
> throws `AlreadyQueuedError` "if the player is already queued or already in an active match" (R2.2), but
> until this correction the implementation only ever checked `entries` — the queue itself — with no
> tracking of "currently in an active match" at all, so a player mid-match could re-queue and be paired
> into a second, simultaneous match. Separately, `tryPairNext()` incremented `activeMatchCount` on every
> successful pairing but nothing ever decremented it (R2.5), so once `maxConcurrentMatches` matches had
> *ever* been played — even long-finished ones — pairing was permanently disabled for the rest of the
> process's life. Both are fixed together: a new `private activeParticipants: Set<PlayerId>` (added to the
> attribute list above) is populated by `tryPairNext()` on a successful pairing and checked by `join()`
> alongside `entries`, and a new `releaseMatch(playerIds: [PlayerId, PlayerId]): void` method (added to the
> operations list above) clears both players from `activeParticipants` and decrements `activeMatchCount`
> (floored at 0). `releaseMatch()` is not called by `MatchmakingQueue` itself — it must be invoked exactly
> once per match, by whatever observes that match ending; see `MatchmakingController`'s correction below.

### 5b. `server/controller`

| Class | Extends | Operations (throws) |
|---|---|---|
| `PlayerIdentifyController` | `extends AbstractController` (untyped/default generics — see Step 10 correction below) | `operation('identify', payload: IdentifyPayload): void` — **throws** `InvalidUsernameError` (R1.1–R1.3) |
| `MatchmakingController` | `extends AbstractController` (untyped/default generics) | `operation(action: 'queue:join' \| 'queue:cancel', payload): void` — **throws** `AlreadyQueuedError`, `NotQueuedError`; on a successful pair, constructs a new `MatchModel` + `MatchBroadcastView` and registers it with `TickLoop` (R2.6) |
| `ChampionSelectController` | `extends AbstractController` (untyped/default generics) | `operation('champion:select', payload): void` — catches `InvalidChampionSelectionError`/`SelectionWindowExpiredError` from the model and asks its view to emit an `error` payload (mirrors the AccountManager example's controller-catches/view-shows-popup pattern, adapted to a socket `error` emission) |
| `CombatController` | `extends AbstractController` (untyped/default generics) | `operation('match:action', payload: MovementInput \| AbilityUseRequest): void` (R4.1, R4.2 — validation failures are swallowed per spec, not surfaced as exceptions to the player) |
| `DisconnectController` | `extends AbstractController` (untyped/default generics) | `operation(action: 'disconnect' \| 'match:reconnect', payload): void` — **throws** `GracePeriodExpiredError` (R6.1–R6.4); forwards to `MatchModel.disconnect`/`reconnect` — the grace-period check itself lives in `MatchModel.tick()`, not here |
| `ConnectionHandler` | *(not an `AbstractController` — a thin Socket.IO transport adapter, kept separate per 3.6.4 Maintainability so game logic is testable without a live socket)* | `constructor(socket: Socket, controllers: {...}, onIdentified?: (player: Player) => void)`; `register(): void` (binds `socket.on(eventName, ...)` for every inbound event in the contract table, forwarding each to the right controller's `operation(...)`); `bindMatch(match: MatchModel, view: MatchBroadcastView): void` — see Step 10 correction below |
| `MatchReportingClient` | *(plain HTTP client, not MVC)* | `reportMatchBegin(matchId: MatchId, participants: MatchBeginReportDTO['participants']): Promise<void>`; `reportMatchEnd(matchId: MatchId, outcome: Omit<MatchEndReportDTO, 'matchId'>): Promise<void>` — both log-and-swallow failures rather than throw, per R7.4 ("shall not interrupt or crash the live game server process") |
| `MatchReportingListener` | `implements ModelListener` *(no paired controller/view — see note below)* | `constructor(match: MatchModel, players: [Player, Player], reportingClient: MatchReportingClient)` (registers itself via `match.addModelListener(this)`); `modelChanged(event: ModelEvent): void` — on `'match:start'`, zips `players` against `event.payload.initialState.participants` by `playerId` and calls `reportingClient.reportMatchBegin`; on `'match:end'`, calls `reportingClient.reportMatchEnd` with the event's `reason`/`winningTeam`/`durationMs` |

**Step 10 correction**: the four `AbstractController<M,V>` "Extends" columns above were originally sketched
with their concrete type parameters (e.g. `AbstractController<MatchmakingQueue, MatchmakingBroadcastView>`);
the real implementations all extend the bare, untyped `AbstractController` (defaulting to `Model`/
`View<Model,any>`) and cast internally where a concrete type is needed (e.g. `this.model as
MatchmakingQueue`) — the same "default (untyped) `AbstractController` generics" pattern
`PlayerIdentifyController` established first (per its own design note) and every other server controller
then followed. `MatchReportingClient.reportMatchBegin`/`reportMatchEnd` also changed from taking
`MatchParticipant[]`/an inline outcome object to the versioned `MatchBeginReportDTO`/`MatchEndReportDTO`
shapes (see §3's matching correction note) — the row above reflects the current signatures.
`ConnectionHandler`'s constructor gained a third, optional `onIdentified` callback (invoked once per
successful `identify`, letting `ServerMain` register the connection's socket/handler into its own
playerId-keyed maps) and a new public `bindMatch()` method (see the `MatchmakingController.
onMatchCreated`-triggered wiring flow below) — neither was in this table's original constructor/operations
sketch.

> **Step 11 correction — real bug found by end-to-end acceptance testing**: `register()`'s raw `'disconnect'`
> socket handler previously only forwarded to `DisconnectController`, and only once `bindMatch()` had bound
> one (i.e. only for a player already paired into a match). A player who disconnected while merely queued —
> the ordinary case of closing a tab, navigating away, or reloading before being matched — left their
> `QueueEntry` in `MatchmakingQueue` forever, since `MatchmakingQueue` has no other cleanup path for it. A
> later `tryPairNext()` could then pair a live, waiting player against that dead entry, silently stranding
> them at Champion Select with an opponent who could never select (until R3.4's 30-second timeout ended the
> match) — this could not have been caught by any prior unit test, since every one of them drives `MatchModel`/
> `MatchmakingQueue` directly rather than through a real, disconnectable Socket.IO connection. Fixed by:
> when `'disconnect'` fires for an identified player with no bound `DisconnectController` (i.e. still only
> queued, never paired), `register()` now calls `MatchmakingController.operation('queue:cancel', { player })`
> and swallows the resulting `NotQueuedError` if the player had never actually joined the queue (e.g.
> disconnecting between `identify` and `queue:join`) — there is no socket left to usefully receive an error
> emission either way.

> **Step 10 correction (`10_server_9`)**: `MatchReportingClient` (`10_server_6`) was implemented and unit
> tested but had no real call site — `ServerMain.ts` explicitly documented this as deferred, leaving
> R7.1–R7.4/R8.1–R8.3/R-DB1–R-DB6 non-functional end-to-end despite every individual class being correct in
> isolation. `MatchReportingListener` is a new class (not in the original class diagram) that closes this
> gap as a second, independent `ModelListener` on `MatchModel` alongside `MatchBroadcastView` — it has no
> paired controller and broadcasts nothing to a socket, so it does not implement `View`. `MatchModel` never
> retains `Player.username` (only `ParticipantState.playerId`), so this listener is constructed with the
> full `Player` objects from `MatchmakingController.createMatch()`, the one place both are in scope
> together, rather than being added to `MatchModel` itself (which must stay free of network/HTTP
> dependencies, 3.6.4). `MatchmakingController`'s constructor gained a fifth, penultimate `onMatchCreated:
> (playerIds: [PlayerId, PlayerId], match: MatchModel, view: MatchBroadcastView) => void` parameter (also
> undocumented until now — it is how `ConnectionHandler.bindMatch()` above gets invoked per paired
> connection, since `ChampionSelectController`/`CombatController`/`DisconnectController` all need a
> `MatchModel` that doesn't exist until pairing happens) plus a trailing `reportingClient:
> MatchReportingClient` parameter (constructed once in `ServerMain.main()` and shared across every
> connection's controller instance) so `createMatch()` can wire a `MatchReportingListener` per match.

> **Step 10 correction (`10_server_10`)**: `MatchmakingController`'s constructor gained a seventh, trailing
> `matchRegistry: Map<PlayerId, MatchRegistryEntry>` parameter — `MatchRegistryEntry` (`{ match: MatchModel;
> view: MatchBroadcastView }`) is a new type, exported alongside `OnMatchCreated`. `createMatch()` now
> registers both paired players into this map (the same place `MatchReportingListener` gets constructed),
> and the `match:end` cleanup listener already sitting on the new `MatchModel` (previously only
> `tickLoop.unregister()`) now also calls `queue.releaseMatch([playerIdA, playerIdB])` (closing
> `MatchmakingQueue`'s R2.2/R2.5 correction above) and deletes both players' `matchRegistry` entries — all
> three cleanup actions share one listener rather than three separate `'match:end'` listeners, since all
> three must fire exactly once, together, per match. `matchRegistry` itself is owned and constructed by
> `ServerMain.main()` (see that class's correction below) and threaded in the same way `sockets`/
> `onMatchCreated`/`reportingClient` already were.

### 5c. `server/view`

| Class | Implements | Operations |
|---|---|---|
| `MatchmakingBroadcastView` | `View, ModelListener` | `constructor(model: MatchmakingQueue, sockets: Map<PlayerId, Socket>)` (registers itself as a listener in the constructor, mirroring `JFrameView`'s registration pattern); `modelChanged(event: ModelEvent): void` (emits `queue:joined` / `queue:cancelled` / `match:found`) |
| `MatchBroadcastView` | `View, ModelListener` | `constructor(model: MatchModel, sockets: Map<PlayerId, Socket>)`; `modelChanged(event: ModelEvent): void` (switches on `event.type` to emit `champion:selected`, `match:start`, `match:state`, `match:end`, `match:player_disconnected`, `match:player_reconnected`) |

**Note:** `getController()`/`setController()` are not applicable on `MatchmakingBroadcastView` and
`MatchBroadcastView` — both are pure observers (broadcasters) with no paired controller, so these two
`View` methods are stubbed to throw rather than implemented.

### 5d. Entry point

| Class | Operations |
|---|---|
| `ServerMain` | `static async main(port: number = Number(process.env.PORT) \|\| 3001): Promise<void>` — creates the HTTP + Socket.IO server, the singleton `MatchmakingQueue` and `TickLoop`, wires a new `ConnectionHandler` per incoming socket connection, starts `TickLoop`, and listens on the given port. `src/index.ts` is a two-line file calling `ServerMain.main()`. |

> **Step 10 correction (`10_server_9`)**: `ServerMain.main()` now constructs one `MatchReportingClient`
> (using an `API_BASE_URL` env var, defaulting to `http://localhost:4000`) before the `io.on('connection',
> ...)` handler, and passes it to every connection's `MatchmakingController`. Previously this construction
> was deliberately omitted with a comment noting "no call site exists yet" — see `MatchReportingListener`'s
> correction note in §5b for the full gap this closes.

> **Step 10 correction**: `main()` also gained an optional `port` parameter, defaulting to `process.env.PORT`
> (falling back to `3001`), where this table originally sketched a zero-arg method — `port: 0` lets a test
> ask the OS for a free ephemeral port instead of hardcoding or mutating env vars mid-suite. `src/index.ts`'s
> call is unaffected, since the parameter is optional.

> **Gap fixed by Step 10 correction (`10_server_10`)** — previously flagged above as a known, unfixed audit
> gap: `main()` only called `ConnectionHandler.bindMatch()` once per player, at the moment
> `MatchmakingController.onMatchCreated` fires during initial pairing
> (`connectionHandlers.get(playerId)?.bindMatch(match, view)`, §5b). A player who disconnects and
> reconnects gets a brand-new Socket.IO connection and therefore a brand-new `ConnectionHandler` instance
> whose `championSelect`/`combat`/`disconnect` controllers were never (re-)bound — `bindMatch()` was never
> called a second time for that player, so the R6.2–R6.4 grace-period mechanism, though correctly
> implemented and unit-tested in isolation on `MatchModel`/`ParticipantState`/`DisconnectController`, had no
> live path by which an actual reconnecting browser could ever reach it. Fixed by: `main()` now owns a
> process-wide `matchRegistry: Map<PlayerId, MatchRegistryEntry>` (new, parallel to the existing `sockets`/
> `connectionHandlers` maps — see `MatchmakingController`'s correction in §5b for how it's populated and
> cleared), and a new standalone exported function, `rebindIfInMatch(handler: ConnectionHandler,
> matchRegistry, playerId: PlayerId): void` (deliberately not inlined in `main()`'s connection closure, so
> it's testable without a live socket per 3.6.4) — called from the existing `onIdentified` callback (the
> same one that already does `sockets.set`/`connectionHandlers.set` on every successful identify, reconnect
> included) — looks the newly-identified player up in `matchRegistry` and calls `handler.bindMatch(...)` if
> found. A player whose match has already ended has no entry (cleared by `MatchmakingController`'s
> `'match:end'` listener before this can ever run) and is correctly left unbound.

> **Step 11 addition**: `ServerMain.stop(): Promise<void>` is a new method, not in the original sketch —
> added for the same reason as `ApiMain.stop()` (§8's `ApiMain` entry): a Playwright acceptance test starts
> a real `ServerMain.main()` and needs to tear it down cleanly afterward. Without it, `TickLoop`'s
> `setInterval` (deliberately never `unref`'d, unlike `httpServer`, since it's what keeps a real production
> process alive) would keep the test process running indefinitely, and a second `main()` call in the same
> process would collide on the already-bound port. `stop()` calls `tickLoop.stop()` and closes the
> Socket.IO server (which also closes the underlying HTTP server). Test-only, like `ApiMain.stop()` — not
> part of this table.

> **Step 11 correction (`11_shared_4`) — real bug found by disconnect/reconnect end-to-end testing**:
> `main()`'s `SocketIOServer` constructor now passes `{ pingInterval: 2_000, pingTimeout: 3_000 }` alongside
> its existing `cors` option. Socket.IO/Engine.IO's *default* heartbeat (`pingInterval` 25s, `pingTimeout`
> 20s) can take up to ~45 seconds to notice a transport that has gone silent without an explicit close —
> exactly what a real network drop looks like (no TCP FIN/RST, frames just stop), as opposed to a tab
> closing cleanly. Against this game's 30-second disconnect grace period (R6.4), that ~45s default
> detection window is not a rare edge case: it could consume the *entire* grace period before the server
> even began counting, meaning a genuinely disconnected player could be held far longer than R6.4 promises,
> and the "notifies the remaining player" half of R6.2 would only fire tens of seconds after the actual
> disconnect. Every individual piece (grace-period math, `MatchRegistryEntry` rebinding, the client's
> reconnect handler) was already correct in isolation — this was invisible to all of them, and only
> surfaced once a real dropped connection was driven through the real stack. Tightened so a genuinely dead
> connection is detected within ~5 seconds, comfortably inside the grace period. Server-only configuration,
> delivered to clients via the Engine.IO handshake — no client-side change needed.

---

## 6. `packages/client` (Raj) — the React browser client

### 6a. `client/model`

| Class | Extends | Attributes | Operations |
|---|---|---|---|
| `ClientIdentityModel` | `extends AbstractModel` | `playerId: PlayerId \| null`; `username: string \| null` | `constructor()`; `identify(username: string): void` (persists to `sessionStorage` per R1.2); `getPlayerId(): PlayerId` |
| `ClientQueueModel` | `extends AbstractModel` | `status: 'idle' \| 'queued' \| 'matched'`; `position: number \| null`; `matchPayload: MatchFoundPayload \| null` (the raw `match:found` payload, stored by `setMatched()`; read by `LobbyView`/`ChampionSelectView`/`ResultsView` for opponent username/team/roster) | `constructor()`; `setQueued(position: number): void`; `setCancelled(): void`; `setMatched(payload: MatchFoundPayload): void` |
| `ClientMatchModel` | `extends AbstractModel` | `matchId: MatchId \| null`; `phase: MatchPhase \| null` (null until a match is found — unlike server's `MatchModel`, which always has a phase from construction); `latestState: MatchStatePayload \| null`; `result: MatchEndPayload \| null`; `championSelection: ChampionSelectedPayload \| null` | `constructor()`; `applyChampionSelected(payload: ChampionSelectedPayload): void`; `applyMatchStart(payload: MatchStartPayload): void`; `applyMatchState(payload: MatchStatePayload): void` (R4.7 — read-only mirror, never mutates authoritative values itself); `applyMatchEnd(payload: MatchEndPayload): void` |
| `InterpolationBuffer` | — | `private samples: MatchStatePayload[]` (ring buffer) | `constructor(capacity: number)`; `push(snapshot: MatchStatePayload): void`; `getInterpolatedPosition(playerId: PlayerId, now: number): Position` (R4.7, R-P4 — smooths rendering between the server's 20Hz ticks without altering any authoritative value) |
| `ClientLeaderboardModel` | `extends AbstractModel` (Step 11, `11_client_7`) | `entries: LeaderboardEntryDTO[] \| null`; `championWinRates: ChampionWinRateDTO[] \| null`; `loading: boolean`; `error: string \| null` | `constructor()`; `setLoading(): void`; `setLoaded(entries, championWinRates): void`; `setError(message: string): void` (SRS 3.2.8, R8.1–R8.3) |

**Step 10 correction (`10_client_5`)**: `ClientQueueModel.matchPayload` (row above) is a new attribute, not
in the original sketch. Separately, all three models' mutator methods (`ClientIdentityModel.identify`;
`ClientQueueModel.setQueued`/`setCancelled`/`setMatched`; `ClientMatchModel.applyChampionSelected`/
`applyMatchStart`/`applyMatchState`/`applyMatchEnd`) originally never called `notifyChanged()` — meaning no
`ModelListener` (i.e. no View) was ever told a change happened, silently defeating the push-MVC contract
this table specifies for every `client/model` class. `LobbyView` registering as the first real listener is
what surfaced the gap; all mutators now call `notifyChanged()` after updating state.

### 6b. `client/controller`

| Class | Extends | Operations |
|---|---|---|
| `SocketConnectionController` | *(not an `AbstractController` — a thin transport adapter coordinating three models, kept separate for the same reason `ConnectionHandler` is on the server side — see §5b)* | `constructor(socket: Socket, models: ClientModels)`; `operation(action: string, payload?: unknown): void` (sends `identify`/`queue:join`/`queue:cancel`/`champion:select`/`match:action` over the socket); `private bindInboundEvents(): void` (routes every inbound event to the matching model's `apply*` method) |

> **Step 10 correction**: `SocketConnectionController` gained a constructor-injected `socket: Socket` parameter during implementation — without a socket reference, `operation()` had nothing to emit on. Mirrors `ConnectionHandler`'s `Socket` parameter on the server side (§5b).
>
> **Known gap surfaced by this audit, not fixed here (see this prompt's closing summary)**: no client
> controller ever actually calls `operation(SOCKET_EVENTS.MATCH_RECONNECT, ...)` — `match:reconnect` is
> defined in the shared contract and handled server-side (`DisconnectController`, §5b) but nothing in
> `packages/client` ever sends it. Combined with §5d's `ServerMain`/`ConnectionHandler.bindMatch()` gap,
> this means the reconnect half of R6.1–R6.4 has no working path end-to-end despite being correctly
> implemented and tested on both `MatchModel` and `DisconnectController` in isolation.
| `LobbyController` | `extends AbstractController<ClientIdentityModel, LobbyView>` | `constructor(model: ClientIdentityModel, view: LobbyView, socketController: SocketConnectionController)`; `operation(action: 'submitUsername' \| 'joinQueue' \| 'cancelQueue' \| 'returnToQueue', payload?: {username: string}): void` (client-side length/non-empty check mirroring R1.1 for `'submitUsername'`, before delegating to `SocketConnectionController`; `'joinQueue'`/`'returnToQueue'` both emit `queue:join`, `'cancelQueue'` emits `queue:cancel`) |
| `ChampionSelectController` | `extends AbstractController<ClientMatchModel, ChampionSelectView>` | `constructor(model: ClientMatchModel, view: ChampionSelectView, socketController: SocketConnectionController)`; `operation('selectChampion', payload: {championId: ChampionId}): void` |
| `MatchController` | `extends AbstractController<ClientMatchModel, MatchHUDView>` | `constructor(model: ClientMatchModel, view: MatchHUDView, socketController: SocketConnectionController, now: () => number = () => Date.now())`; `operation('move' \| 'useAbility', payload): void` (throttles/sends `match:action`) |
| `LeaderboardController` | `extends AbstractController<ClientLeaderboardModel, LeaderboardView>` (Step 11, `11_client_7`) | `constructor(model, view, apiBaseUrl?: string, fetchImpl?: typeof fetch)`; `operation('refresh'): void` (fetches `GET /leaderboard` + `GET /leaderboard/champions` in parallel). **The client's first controller that talks directly to the api over plain HTTP** — every other controller here forwards through `SocketConnectionController`/Socket.IO instead (master context §2.3). |

**Step 10 correction**: all three controllers above gained constructor parameters beyond the inherited
`(model, view)` this table originally sketched — `socketController: SocketConnectionController` on all
three (needed to actually emit anything, the same gap `MatchmakingController` closed on the server side),
plus `now: () => number` on `MatchController` (injected clock for deterministic move-throttle testing).
`LobbyController.operation()`'s action set also grew from just `'submitUsername'` to include `'joinQueue'`,
`'cancelQueue'`, and `'returnToQueue'` (the last used by `ResultsView`'s return-to-queue control, per the
6c gap-fill note below) — the row above reflects the current signatures.

### 6c. `client/view` (React screens per SRS 3.1.1)

| Class | Implements | Responsibility |
|---|---|---|
| `LobbyView` | `View, ModelListener` | Username field, "Find Match" control, queue status/cancel |
| `ChampionSelectView` | `View, ModelListener` | Both players, selection countdown, roster with stats/abilities |
| `MatchHUDView` | `View, ModelListener` | Health/resource bars, cooldown indicators, arena rendering via `InterpolationBuffer` |
| `ResultsView` | `View, ModelListener` | Outcome, reason, duration, return-to-queue control |
| `LeaderboardView` | `View, ModelListener` (Step 11, `11_client_7`) | Player ranking table + per-champion win-rate summary (SRS 3.2.8, R8.1–R8.3). **Not one of SRS 3.1.1's four formally-listed screens** — 3.1.1 never actually lists a Leaderboard screen even though 1.3/2.2 both describe the client as letting a player "view a leaderboard," a real ambiguity in the SRS baseline. Resolved as a fifth, non-phase-driven screen: `ClientMain.tsx`'s `AppRouter` owns a plain `showLeaderboard` boolean, checked before the usual four-way phase routing, toggled on via an `onViewLeaderboard` prop passed to `LobbyScreen` (idle state) and `ResultsScreen` only. |

**Note (Step 2 gap-fill):** `ResultsView` pairs with `LobbyController` rather than a dedicated results
controller — "return to queue" is a lobby action, and no separate controller was specified for this view.
Documented here rather than left as a silent inconsistency with 6b. **Verified still accurate** in the
final implementation (`ResultsView.ts` constructs no controller of its own; `ClientMain`'s `wirePair` binds
it to the existing `LobbyController`).

Each `*View` class implements `modelChanged(event: ModelEvent): void` by invoking a bound React
`setState`/hook-dispatch callback — **Step 10 correction**: contrary to this table's original "supplied at
construction" framing, the callback is registered later, via a separate `bindUpdateCallback(callback: () =>
void): void` method (not part of the shared `View<M,C>` interface), called from the paired Screen
component's `useEffect` after mount, not passed into the `View` class's constructor. The `View` class
remains the MVC-facing object; the functional component it's paired with is the render target. This keeps
the same push-MVC contract on the client that the server uses, satisfying the "system MUST exemplify MVC"
requirement uniformly across subsystems.

**Step 10 correction**: all four `View` classes' constructors also take additional model references beyond
the single model implied by `implements View, ModelListener` — `LobbyView(identityModel, queueModel,
controller)`, `ChampionSelectView(identityModel, matchModel, queueModel, controller)`,
`MatchHUDView(identityModel, matchModel, controller)`, `ResultsView(matchModel, queueModel, controller)` —
each with matching `get`/`setXModel()` accessors outside the formal `View<M,C>` contract, needed because
each screen's documented responsibility above (e.g. Lobby's "queue status/cancel") spans more than one
model. `getModel()`/`setModel()` still resolve to the one model each view's paired controller expects.

**Step 11 correction — real bug found by end-to-end acceptance testing**: `MatchHUDScreen`'s ability-control
buttons (paired with `MatchHUDView`) previously called `controller.operation('useAbility', { abilityId })`
with no `targetPlayerId` for every ability, regardless of `effectType`. `MatchModel.submitAbility` (§5a)
treats a request naming no target as self-targeted — correct for a self-heal kit, but it meant every
`DAMAGE`/`CROWD_CONTROL` ability a player fired landed on themself, never their opponent: real combat
between two live players could not deal damage to the opponent through the actual built UI. This was
invisible to every prior test, including `MatchHUDScreen.test.tsx`'s own click-forwarding test, since all of
them asserted only that *an* ability request reached the socket, not who it targeted. Fixed by: the button's
`onClick` now includes `targetPlayerId: opponent.playerId` when `ability.effectType` is `DAMAGE` or
`CROWD_CONTROL`; `HEAL`/`POSITIONING` abilities keep the previous no-target (self) behavior, matching their
self-directed design intent (§1.4's champion kit design notes).

**Undocumented, paired React components:** each `*View` class's `.tsx` file also exports a same-named
`*Screen` functional component (`LobbyScreen`, `ChampionSelectScreen`, `MatchHUDScreen`, `ResultsScreen`) —
the actual render target the `View` class's `bindUpdateCallback` triggers, per SRS 3.1.1. These are real,
separate, exported components with no row of their own in this table; only the four `View` classes above
are enumerated. `ClientMain.tsx`'s `wirePair` helper is also undocumented here.

**Step 11 correction (11_shared_4) — `MatchHUDView` gains a 5th, optional constructor param**:
`MatchHUDView(identityModel, matchModel, controller, socket?)`. `socket` is the live Socket.IO client
connection, listened to directly for `match:player_disconnected`/`match:player_reconnected` — per
`SocketConnectionController.bindInboundEvents`'s own doc comment (§6b), those two events are deliberately
never routed through any model, so this view listens to the raw socket itself rather than a new model
field being invented for them. Backs a new transient, UI-only `opponentDisconnect` field (never persisted,
never exposed to `ClientMatchModel`) and a matching `getOpponentDisconnect()` accessor, which
`MatchHUDScreen` renders as a "Opponent disconnected — reconnecting in Ns" banner (R6.2, 3.6.5 Usability)
that clears once the matching `match:player_reconnected` arrives. `socket` is optional (defaulting to
unset, in which case the banner never appears) so every pre-existing call site that has no reason to
exercise it — most unit tests — is unaffected; `ClientMain.tsx` passes the real socket.

**Step 11 correction (`11_client_8`) — `ChampionSprite` extracted to its own module**: the pixel-art sprite
renderer (`CHAMPION_SPRITES`, `SPRITE_CELL_PX`, `SPRITE_PIXEL_COLORS`, `ChampionSprite`) previously lived as
a private implementation detail of `MatchHUDView.tsx`. Moved to `client/src/view/ChampionSprite.tsx` and
exported, since `ChampionSelectView.tsx` now also renders it (one portrait per roster card — that screen
previously had no champion sprite/portrait at all, only a text/stat block). `MatchHUDView.tsx` imports it
rather than defining it locally; both call sites pass `championId`, and `MatchHUDView`'s two in-arena
markers additionally pass `animated` for a subtle idle-bob CSS animation that Champion Select's roster
cards intentionally omit (so cards stay still and easy to compare while choosing). Not a `View`/`Model`/
`Controller` in the MVC sense — a plain shared rendering helper, same category as the undocumented `*Screen`
components noted above, so it gets a prose note here rather than a table row of its own.

### 6d. Entry point

| Class | Operations |
|---|---|
| `ClientMain` | `static main(socketFactory: () => Socket = () => io()): void` — mounts the React root, instantiates the model/controller graph, and renders the screen router (`src/index.tsx` calls `ClientMain.main()`). |

**Step 10 correction**: `main()` gained an optional `socketFactory` parameter, defaulting to a real `io()`
call, where this table originally sketched a zero-arg method — this lets `ClientMain.main()` be exercised
by a test without opening a live socket connection (master context §4.2's testability principle); a test
supplies a mock satisfying the same `emit`/`on` shape instead.

**Step 10 correction (`10_client_10`, R6.1–R6.4 client-side gap)**: `main()` now also registers a
`socket.on('connect', ...)` handler, right after `socketController` is constructed. Socket.IO's client
fires its own `'connect'` event both on the first successful connection and on every subsequent
transport-level reconnect (its own automatic reconnection, no application code required to trigger it).
On each firing, if `identityModel.username` and `identityModel.playerId` are both already set (i.e. this
connection has identified before — false on the very first, pre-login connect, so nothing is emitted
then), the handler re-emits `identify` with the existing `{playerId, username}` via
`socketController.operation(SOCKET_EVENTS.IDENTIFY, ...)`. If, in addition, `matchModel.matchId !== null &&
matchModel.phase !== MatchPhase.ENDED`, it also emits `socketController.operation(SOCKET_EVENTS.MATCH_RECONNECT)`,
after the `identify` re-emission — ordering matters, since the server rejects `match:reconnect` on a
connection that hasn't (re-)identified yet. This was previously a real, confirmed gap: the client never
emitted `match:reconnect` anywhere in `packages/client/src` (07_shared_1's audit), even though the wire
event and the server-side `DisconnectController`/`MatchModel.reconnect()` handling already existed.

### 6e. Build tooling (`11_client_1`)

Through Step 10, `packages/client` was only ever exercised in isolation via Jest + jsdom + React Testing
Library — it had no bundler, no `index.html`, and could never actually run as a web app. This step adds
[Vite](https://vite.dev) (`vite`, `@vitejs/plugin-react`) as the client's dev/build tool:

- `packages/client/index.html` — the SPA shell, with `<div id="root">` (matched by `ClientMain.main()`'s
  existing `document.getElementById('root')` lookup, unchanged) and a module script pointing at the entry
  file.
- `packages/client/src/index.tsx` — the actual entry point (pre-existing from Step 10, unchanged by this
  step): two lines, `import { ClientMain } from './ClientMain'; ClientMain.main();`. `ClientMain.tsx` itself
  only exports the class; it has no side effects on import.
- `packages/client/package.json` gained `dev` (`vite`), `build` (`vite build`), and `preview` (`vite
  preview`) scripts — `npm run build` from the repo root now produces `packages/client/dist/`.
- `packages/client/vite.config.ts` — minimal, one plugin (`@vitejs/plugin-react`).

**Server URL configuration**: `ClientMain.main()`'s default `socketFactory` previously called a bare
`io()` — Socket.IO interprets no URL as "connect to the page's own origin," which only works if client and
server happen to share an origin (they don't: separate processes, separate ports in dev, likely separate
hosts in production). The default now reads a `VITE_SERVER_URL` env var, falling back to
`http://localhost:3001` for local dev, e.g. `VITE_SERVER_URL=https://api.example.com npm run build -w
@arena/client`.

**Deviation from Vite's usual `import.meta.env.VITE_*` convention**: `import.meta` syntax is only legal
TypeScript under an ESM `module` target, but `packages/client/tsconfig.json` targets CommonJS so that
ts-jest can transform the same source files for Jest — switching the workspace to an ESM target would
require reworking Jest's transform for ESM too, well outside this step's scope (and explicitly flagged in
`11_client_1` as a reason to stop and reconsider). Instead, `vite.config.ts` reads `VITE_SERVER_URL` via
`loadEnv()` and injects it as a plain global, `__SERVER_URL__` (declared ambient in `src/vite-env.d.ts`),
via Vite's `define`. `ClientMain.tsx` reads it through a `typeof __SERVER_URL__ !== 'undefined'` guard,
which is `false` (falling back to the localhost default) whenever the file is compiled outside a Vite
build — e.g. by ts-jest — so no test needed to change.

---

## 7. `packages/api` (En) — REST API + persistence

### 7a. `api/model`

| Class | Attributes | Operations (throws) |
|---|---|---|
| `PlayerRepository` | — | `findOrCreateByUsername(username: string): Promise<Player>` — **throws** `PersistenceError` (R-DB1, 3.2.1) |
| `MatchRepository` | — | `recordMatch(match: Match, participants: MatchParticipant[]): Promise<void>` — **throws** `PersistenceError` (R7.1, R-DB2, R-DB4); `findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchHistoryRow[]>` (R7.3, R-DB5) |
| `LeaderboardEntry` | `playerId, username, wins, losses, draws, gamesPlayed, winRate` | `constructor(...)`; `static fromRow(row): LeaderboardEntry` |
| `LeaderboardRepository` | — | `computeLeaderboard(minGames: number): Promise<LeaderboardEntry[]>` (R8.1, R8.2); `computeChampionWinRates(): Promise<ChampionWinRateDTO[]>` (R8.3) |
| `PendingMatchCorrelator` | `private pending: Map<MatchId, PendingRecord>` (`PendingRecord = { begin?: BeginParticipant[]; end?: MatchOutcome }`); `private completed: Set<MatchId>` (idempotency guard — see note below) | `recordBegin(matchId: MatchId, participants: BeginParticipant[]): void`; `recordEnd(matchId: MatchId, outcome: MatchOutcome): CorrelatedMatchReport \| null` (`CorrelatedMatchReport = { participants: BeginParticipant[]; outcome: MatchOutcome }`; returns the combined record only once both halves are present — SRS 3.2.7.4 step 26) |

**Step 10 correction**: `MatchRepository.findHistoryForPlayer` originally returned `Promise<MatchParticipant[]>`
(commit `f32472d`, the "opponent-join correction"). `MatchParticipant` is a fixed per-participant
persistence row (§4a) with no opponent reference, so it cannot carry the `opponentUsername` that
`MatchHistoryEntryDTO` (§3, R7.3) needs. The real implementation instead returns the richer
`MatchHistoryRow` shape (`matchId, opponentUsername, championId, result, endReason, durationMs, endedAt` —
no `team`), built by a single query that self-joins `match_participants` to itself (excluding the querying
player's own row — a 1v1 match always has exactly one other participant) plus `players` for that opponent's
username, rather than an N+1 follow-up lookup per row.

**Step 10 correction**: `PendingMatchCorrelator`'s attribute row above gained a second field,
`completed: Set<MatchId>` — every `matchId` already handed off to the caller via `recordEnd()`, guarding
against a retried report reviving an already-completed match. This is the class's actual idempotency
mechanism (master context §8's "CRITICAL CHECKPOINT" for this class); the original `private pending: Map`
alone was not enough to make `recordBegin`/`recordEnd` idempotent per `matchId`. `recordEnd`'s return shape
also uses named fields `{ participants, outcome }` (`CorrelatedMatchReport`), not the originally-sketched
`{ begin, end }`.

### 7b. `api/controller`

| Class | Extends | Operations |
|---|---|---|
| `InternalMatchController` | `extends AbstractController` | `constructor(correlator: PendingMatchCorrelator, matchRepository: MatchRepository, playerRepository: PlayerRepository, errorView?: ErrorResponseView)`; `POST /internal/matches/begin`, `POST /internal/matches/end` — receives `MatchReportingClient`'s calls, uses `PendingMatchCorrelator` then `MatchRepository.recordMatch()`; not exposed to players |
| `MatchHistoryController` | `extends AbstractController` | `GET /players/:id/matches?page=&pageSize=` (R7.3) |
| `LeaderboardController` | `extends AbstractController` | `GET /leaderboard`, `GET /leaderboard/champions` (R8.1–R8.3) |

**Step 10 correction**: `InternalMatchController`'s constructor gained an undocumented `playerRepository:
PlayerRepository` dependency. `handleEnd` calls `playerRepository.findOrCreateByUsername(username)` per
participant, resolving each `BeginParticipant.playerId` (a transient, client-generated session id, R1.2) to
its canonical `players.id` before calling `MatchRepository.recordMatch()` — `match_participants.player_id`
has a foreign key to `players(id)`, which the transient id alone can never satisfy. Not a code gap; the
class's own doc comment calls this a "CRITICAL CORRECTION" and explains that without it, every single
`recordMatch` call would fail its foreign-key constraint — the persistence path's core purpose (R7.1) would
silently never work.

All three api controllers pass a shared `NULL_MODEL`/`NULL_VIEW` pair (`packages/api/src/controller/
nullMvc.ts`, undocumented until now) to `super(NULL_MODEL, NULL_VIEW)` — REST controllers have no domain
`Model` to observe and no push-based `View` to notify (each request gets one synchronous response), but
`AbstractController`'s constructor structurally requires a model/view pair. `nullMvc.ts` supplies a
harmless no-op pair so no api controller needs to invent a fake domain object of its own.

### 7c. `api/view`

| Class | Implements | Responsibility |
|---|---|---|
| `LeaderboardResponseView` | — | Formats `LeaderboardEntry[]` → `LeaderboardEntryDTO[]` JSON |
| `MatchHistoryResponseView` | — | Formats `MatchHistoryRow[]` → `MatchHistoryEntryDTO[]` JSON (pagination happens upstream, in `MatchRepository`'s `LIMIT`/`OFFSET` query — this view is a pure formatter) |
| `ErrorResponseView` | — | Formats a caught `ArenaError` into an HTTP status + JSON error body |

Unlike the server's broadcast views, these are plain formatter classes (a `render()` method only) — a
synchronous HTTP response has no push/observe relationship to establish, so implementing the full `View`
interface would be unused ceremony.

**Step 10 correction**: `MatchHistoryResponseView.render()`'s input type follows `MatchRepository.
findHistoryForPlayer`'s Step 10 correction above — `MatchHistoryRow[]`, not `MatchParticipant[]` — and this
table's original "paginated" framing was inaccurate: pagination is `LIMIT`/`OFFSET` in the repository's SQL,
not logic in this view.

### 7d. `api/util` and entry point

| Class | Operations |
|---|---|
| `PgPool` | `constructor(connectionString: string)`; `query<T>(sql: string, params: unknown[]): Promise<T[]>` — **throws** `PersistenceError`; `transaction<T>(fn: (query) => Promise<T>): Promise<T>` — runs `fn` atomically over one pooled connection (`BEGIN`/`COMMIT`/`ROLLBACK`) — **throws** `PersistenceError`; `close(): Promise<void>` — releases all pooled connections (process shutdown, test teardown) |
| `ApiMain` | `static async main(): Promise<void>` — builds the Express app, wires middleware and the three controllers above to routes, connects `PgPool`, and listens on the configured port; `static async stop(): Promise<void>` — closes the server and pool (test-only teardown) |

**Step 9 addition**: `transaction<T>()` was added during `MatchRepository` implementation — `recordMatch`
needs one `matches` row and two `match_participants` rows to commit or fail together (R-DB4), which plain
`query()` calls against a connection pool cannot guarantee.

**Step 10 addition**: `ApiMain.stop()` is a new method, not in the original sketch — added solely so a
smoke test can tear the server and pool down cleanly; `ApiMain`'s own JSDoc flags it as outside this table's
original entry-point sketch.

> **Step 11 correction (`11_client_7`) — real integration bug found by end-to-end testing**: `ApiMain.main()`
> now installs a small, dependency-free CORS middleware (`Access-Control-Allow-Origin: *` plus a plain
> `OPTIONS` preflight handler) ahead of every route. Every public `GET` route here was always meant to be
> fetched directly by the browser client (master context §2.3), but nothing ever actually did that until
> `LeaderboardController` (`packages/client`, §6b) — the client's first direct REST consumer. Every prior
> verification of these routes used either Playwright's own server-side `request` fixture or a raw
> Jest/`fetch` call from Node, neither of which is subject to a browser's CORS policy the way a real
> `fetch()` from a page served on a different origin is — so the gap was invisible until a real
> browser-origin request actually hit it (Playwright's e2e suite, once its client-launched `webServer` had
> a real reason to call `/leaderboard` itself). Public, read-only data with no cookies/credentials involved,
> so a permissive `*` origin is appropriate.

---

## 8. Relationships summary (for the diagram)

**Generalization / realization:**
- `AbstractModel` implements `Model`; `AbstractController` implements `Controller`.
- `MatchmakingQueue`, `MatchModel`, `ClientIdentityModel`, `ClientQueueModel`, `ClientMatchModel` all extend `AbstractModel`.
- Every `*Controller` class (both `server` and `client`, plus `api`'s three) extends `AbstractController`.
- `MatchmakingBroadcastView`, `MatchBroadcastView`, and all four `client/view` classes implement `View`; the ones that react to push events also implement `ModelListener`.
- All exceptions in §4 extend `ArenaError extends Error`.

**Composition / aggregation (strong ownership):**
- `MatchModel` *owns* exactly two `ParticipantState` (1v1 scope, R-DB — lifecycle-bound, created/destroyed with the match).
- `Champion` *owns* its `Ability[]` (abilities have no existence independent of a champion definition).
- `MatchmakingQueue` *owns* its ordered `QueueEntry[]`.
- `TickLoop` *aggregates* (does not own the lifecycle of) the `MatchModel`s it drives — a match is created by `MatchmakingController` and merely *registered* with the loop.

**Association (reference, not ownership):**
- `ParticipantState` references a `Champion` by id (many participants across many matches can reference the same immutable `Champion` definition from `ChampionRoster`).
- `MatchBroadcastView`/`MatchmakingBroadcastView` *observe* their `Model` (classic Observer/`ModelListener` association) and hold a reference to the `Socket`s they emit to.
- `AbstractController` holds exactly one `Model` and one `View` (1-to-1 per controller instance, matching "one controller instance per view instance" from the course examples); `packages/api`'s three REST controllers hold a shared no-op `NULL_MODEL`/`NULL_VIEW` pair (`api/src/controller/nullMvc.ts`) instead of a real domain model/view, since a synchronous HTTP response has no push/observe relationship to establish.
- `*Repository` classes *depend on* `PgPool` (dependency, not ownership — the pool is shared/injected). `InternalMatchController` additionally depends on `PlayerRepository` directly (Step 10 correction, §7b), to resolve each reported participant's canonical player id before `MatchRepository.recordMatch()`.
- **Step 10 addition**: `MatchModel` is observed by *two* independent `ModelListener`s per match, not one — `MatchBroadcastView` (broadcasts to sockets) and `MatchReportingListener` (reports begin/end to `packages/api` via `MatchReportingClient`). Neither listener is aware of the other; `MatchModel` itself has no reference to either (pure Observer push, per §1's MVC framework).

**Cross-subsystem (not object references — network calls, worth flagging as a distinct relationship kind on the diagram):**
- `server`'s `MatchReportingClient` → `api`'s `InternalMatchController`: HTTP, not an in-process reference. This is the one place the "independently deployable subsystems" boundary (SRS 2.1) cuts through what would otherwise look like a normal association — the diagram should render it as a dependency across a package/subsystem boundary, not a solid association line.
- `client` ↔ `server`: WebSocket, mediated entirely by the `packages/shared/src/contract` DTOs — no direct class references cross this boundary either.

---

## 9. Ownership recap (for dividing Step-2-onward prompts)

| Package | Classes | Primary owner |
|---|---|---|
| `shared/mvc` | 7 framework types | Marshall |
| `shared/domain` | 13 types | En (content), Marshall (Player/Match/MatchParticipant shapes) |
| `shared/contract` | 17 DTOs | Marshall |
| `shared/exceptions`, `shared/util` | 17 types | Marshall (base + server-side), En (persistence-side) |
| `server/*` | 5 model + 7 controller/adapter + 2 view + 1 entry = 15 | **Marshall** |
| `client/*` | 4 model + 4 controller + 4 view + 1 entry = 13 | **Raj** |
| `api/*` | 5 model + 3 controller + 3 view + 2 util/entry = 13 | **En** |

Marshall's ownership of `shared/*` (minus champion content) is intentional: per SRS Appendix C, the
shared WebSocket contract is AI-generated then reviewed/iterated by Marshall specifically, so a single
person is accountable for the one artifact both other subsystems depend on — avoiding the classic
distributed-team failure mode of an unowned shared interface drifting out of sync.

---

## Next steps (not yet done)

- Turn this into an actual UML diagram (boxes/arrows) — awaiting your go-ahead.
- Step 2 skeleton-code prompt(s), one per package, each ending in a git commit per your earlier
  instruction — awaiting your go-ahead, and awaiting confirmation this class list is approved.
