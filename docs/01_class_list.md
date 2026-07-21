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
| `Position` | class | `x: number`; `y: number` | `constructor(x: number, y: number)`; `distanceTo(other: Position): number` |
| `Ability` | class | `id: string`; `name: string`; `cooldownSeconds: number`; `resourceCost: number`; `range: number`; `effectType: EffectType`; `magnitude: number` | `constructor(id, name, cooldownSeconds, resourceCost, range, effectType, magnitude)` |
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

Every named Socket.IO event in SRS Appendix A (`identify`, `queue:join`, `queue:cancel`,
`champion:select`, `match:action`, `match:reconnect`, `queue:joined`, `queue:cancelled`, `match:found`,
`champion:selected`, `match:start`, `match:state`, `match:end`, `match:player_disconnected`,
`match:player_reconnected`, `error`) has exactly one payload type above. This table **is** the versioned
contract referenced by SRS 1.4 and R-D2 — Step 2's skeleton prompt will generate this file byte-for-byte
from this table.

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
| `TargetOutOfRangeError` | `ArenaError` | `ParticipantState.useAbility()` | R4.2 |
| `GracePeriodExpiredError` | `ArenaError` | `MatchModel.reconnect()` | R6.4 |
| `PlayerNotFoundError` | `ArenaError` | `PlayerRepository` lookups | general |
| `PersistenceError` | `ArenaError` | any `*Repository` method | R7.4, R-DB4 |
| `ValidationError` | `ArenaError` | REST controllers, request body validation | 3.6.2 |

`packages/shared/src/util/NotImplementedError.ts` (extends `Error`, not `ArenaError`) is the Step-3
scaffolding exception every stub method throws so the skeleton compiles before implementations exist —
not a domain exception, and it should not appear in the final diagram after Step 9–10.

---

## 5. `packages/server` (Marshall) — the authoritative game server

### 5a. `server/model`

| Class | Extends/Implements | Attributes | Operations (throws) |
|---|---|---|---|
| `QueueEntry` | — | `playerId: PlayerId`; `username: string`; `joinedAt: number` | `constructor(playerId, username, joinedAt)` |
| `MatchmakingQueue` | `extends AbstractModel` | `private entries: QueueEntry[]`; `private activeMatchCount: number`; `private readonly maxConcurrentMatches: number` | `constructor(maxConcurrentMatches: number)`; `join(player: Player): number` — **throws** `AlreadyQueuedError` (R2.1, R2.2); `cancel(playerId: PlayerId): void` — **throws** `NotQueuedError` (R2.3); `tryPairNext(): [QueueEntry, QueueEntry] \| null` (R2.4, R2.5); `size(): number` |
| `ParticipantState` | — | `playerId: PlayerId`; `team: Team`; `champion: Champion \| null`; `position: Position`; `health: number`; `resource: number`; `cooldowns: Map<string, number>`; `crowdControlledUntil: number`; `connectionStatus: ConnectionStatus`; `disconnectedAt: number \| null` | `constructor(playerId, team)`; `applyDamage(amount: number): void`; `applyHeal(amount: number): void`; `applyCrowdControl(durationMs: number): void`; `regenerateResource(deltaSeconds: number): void`; `canUseAbility(abilityId: string, now: number): boolean`; `useAbility(ability: Ability, now: number): void` — **throws** `AbilityOnCooldownError`, `InsufficientResourceError`, `ActorIncapacitatedError` (R4.2); `move(direction: MovementInput, deltaSeconds: number): void` — **throws** `ActorIncapacitatedError`; `isAlive(): boolean`; `toSnapshot(): ParticipantSnapshot` |
| `MatchModel` | `extends AbstractModel` | `readonly id: MatchId`; `phase: MatchPhase`; `participants: [ParticipantState, ParticipantState]`; `championSelectDeadline: number`; `startedAt: number \| null`; `endedAt: number \| null`; `endReason: EndReason \| null`; `winningTeam: Team \| null` | `constructor(id: MatchId, players: [Player, Player])`; `selectChampion(playerId: PlayerId, championId: ChampionId): void` — **throws** `InvalidChampionSelectionError`, `SelectionWindowExpiredError`, `InvalidMatchPhaseError` (R3.2–R3.5); `submitMove(playerId: PlayerId, input: MovementInput): void` — **throws** `InvalidMatchPhaseError` (R4.1); `submitAbility(playerId: PlayerId, req: AbilityUseRequest): void` — **throws** `InvalidMatchPhaseError` (invalid ability attempts are otherwise swallowed per R4's "silently ignores"); `tick(deltaSeconds: number): void` (R4.3–R4.6, calls `notifyChanged` with a `state` `ModelEvent`); `checkWinConditions(): EndReason \| null` (R5.1, R5.2); `disconnect(playerId: PlayerId): void` (R6.1, R6.2); `reconnect(playerId: PlayerId): void` — **throws** `GracePeriodExpiredError` (R6.3); `snapshot(): MatchStatePayload` |
| `TickLoop` | — | `private readonly tickRateHz = 20`; `private matches: Map<MatchId, MatchModel>`; `private handle: NodeJS.Timeout \| null` | `constructor(tickRateHz?: number)`; `register(match: MatchModel): void`; `unregister(matchId: MatchId): void`; `start(): void`; `stop(): void`; `private onTick(): void` (R-P1 — iterates all registered matches, calls `tick()` on each inside a try/catch **per match** so one match's internal error cannot affect another, satisfying R5.4 / 3.6.2) |

### 5b. `server/controller`

| Class | Extends | Operations (throws) |
|---|---|---|
| `PlayerIdentifyController` | `extends AbstractController<Player-ish session model, ...>` | `operation('identify', payload: IdentifyPayload): void` — **throws** `InvalidUsernameError` (R1.1–R1.3) |
| `MatchmakingController` | `extends AbstractController<MatchmakingQueue, MatchmakingBroadcastView>` | `operation(action: 'queue:join' \| 'queue:cancel', payload): void` — **throws** `AlreadyQueuedError`, `NotQueuedError`; on a successful pair, constructs a new `MatchModel` + `MatchBroadcastView` and registers it with `TickLoop` (R2.6) |
| `ChampionSelectController` | `extends AbstractController<MatchModel, MatchBroadcastView>` | `operation('champion:select', payload): void` — catches `InvalidChampionSelectionError`/`SelectionWindowExpiredError` from the model and asks its view to emit an `error` payload (mirrors the AccountManager example's controller-catches/view-shows-popup pattern, adapted to a socket `error` emission) |
| `CombatController` | `extends AbstractController<MatchModel, MatchBroadcastView>` | `operation('match:action', payload: MovementInput \| AbilityUseRequest): void` (R4.1, R4.2 — validation failures are swallowed per spec, not surfaced as exceptions to the player) |
| `DisconnectController` | `extends AbstractController<MatchModel, MatchBroadcastView>` | `operation(action: 'disconnect' \| 'match:reconnect', payload): void` — **throws** `GracePeriodExpiredError` (R6.1–R6.4); owns the grace-period timer |
| `ConnectionHandler` | *(not an `AbstractController` — a thin Socket.IO transport adapter, kept separate per 3.6.4 Maintainability so game logic is testable without a live socket)* | `constructor(socket: Socket, controllers: {...})`; `register(): void` (binds `socket.on(eventName, ...)` for every inbound event in the contract table, forwarding each to the right controller's `operation(...)`) |
| `MatchReportingClient` | *(plain HTTP client, not MVC)* | `reportMatchBegin(matchId: MatchId, participants: MatchParticipant[]): Promise<void>`; `reportMatchEnd(matchId: MatchId, outcome: {...}): Promise<void>` — both log-and-swallow failures rather than throw, per R7.4 ("shall not interrupt or crash the live game server process") |

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
| `ServerMain` | `static async main(): Promise<void>` — creates the HTTP + Socket.IO server, the singleton `MatchmakingQueue` and `TickLoop`, wires a new `ConnectionHandler` per incoming socket connection, starts `TickLoop`, and listens on the configured port. `src/index.ts` is a two-line file calling `ServerMain.main()`. |

---

## 6. `packages/client` (Raj) — the React browser client

### 6a. `client/model`

| Class | Extends | Attributes | Operations |
|---|---|---|---|
| `ClientIdentityModel` | `extends AbstractModel` | `playerId: PlayerId \| null`; `username: string \| null` | `constructor()`; `identify(username: string): void` (persists to `sessionStorage` per R1.2); `getPlayerId(): PlayerId` |
| `ClientQueueModel` | `extends AbstractModel` | `status: 'idle' \| 'queued' \| 'matched'`; `position: number \| null` | `constructor()`; `setQueued(position: number): void`; `setCancelled(): void`; `setMatched(payload: MatchFoundPayload): void` |
| `ClientMatchModel` | `extends AbstractModel` | `matchId: MatchId \| null`; `phase: MatchPhase \| null` (null until a match is found — unlike server's `MatchModel`, which always has a phase from construction); `latestState: MatchStatePayload \| null`; `result: MatchEndPayload \| null` | `constructor()`; `applyChampionSelected(payload: ChampionSelectedPayload): void`; `applyMatchStart(payload: MatchStartPayload): void`; `applyMatchState(payload: MatchStatePayload): void` (R4.7 — read-only mirror, never mutates authoritative values itself); `applyMatchEnd(payload: MatchEndPayload): void` |
| `InterpolationBuffer` | — | `private samples: MatchStatePayload[]` (ring buffer) | `constructor(capacity: number)`; `push(snapshot: MatchStatePayload): void`; `getInterpolatedPosition(playerId: PlayerId, now: number): Position` (R4.7, R-P4 — smooths rendering between the server's 20Hz ticks without altering any authoritative value) |

### 6b. `client/controller`

| Class | Extends | Operations |
|---|---|---|
| `SocketConnectionController` | *(not an `AbstractController` — a thin transport adapter coordinating three models, kept separate for the same reason `ConnectionHandler` is on the server side — see §5b)* | `constructor(models: {...})`; `operation(action: string, payload?: unknown): void` (sends `identify`/`queue:join`/`queue:cancel`/`champion:select`/`match:action`/`match:reconnect` over the socket); `private bindInboundEvents(): void` (routes every inbound event to the matching model's `apply*` method) |
| `LobbyController` | `extends AbstractController<ClientIdentityModel, LobbyView>` | `operation('submitUsername', payload: {username: string}): void` (client-side length/non-empty check mirroring R1.1, before delegating to `SocketConnectionController`) |
| `ChampionSelectController` | `extends AbstractController<ClientMatchModel, ChampionSelectView>` | `operation('selectChampion', payload: {championId: ChampionId}): void` |
| `MatchController` | `extends AbstractController<ClientMatchModel, MatchHUDView>` | `operation('move' \| 'useAbility', payload): void` (throttles/sends `match:action`) |

### 6c. `client/view` (React screens per SRS 3.1.1)

| Class | Implements | Responsibility |
|---|---|---|
| `LobbyView` | `View, ModelListener` | Username field, "Find Match" control, queue status/cancel |
| `ChampionSelectView` | `View, ModelListener` | Both players, selection countdown, roster with stats/abilities |
| `MatchHUDView` | `View, ModelListener` | Health/resource bars, cooldown indicators, arena rendering via `InterpolationBuffer` |
| `ResultsView` | `View, ModelListener` | Outcome, reason, duration, return-to-queue control |

**Note (Step 2 gap-fill):** `ResultsView` pairs with `LobbyController` rather than a dedicated results
controller — "return to queue" is a lobby action, and no separate controller was specified for this view.
Documented here rather than left as a silent inconsistency with 6b.

Each `*View` class implements `modelChanged(event: ModelEvent): void` by invoking a bound React
`setState`/hook-dispatch callback supplied at construction — the class is the MVC-facing object; the
functional component it's paired with is the render target. This keeps the same push-MVC contract on the
client that the server uses, satisfying the "system MUST exemplify MVC" requirement uniformly across
subsystems.

### 6d. Entry point

| Class | Operations |
|---|---|
| `ClientMain` | `static main(): void` — mounts the React root, instantiates the model/controller graph, and renders the screen router (`src/index.tsx` calls `ClientMain.main()`). |

---

## 7. `packages/api` (En) — REST API + persistence

### 7a. `api/model`

| Class | Attributes | Operations (throws) |
|---|---|---|
| `PlayerRepository` | — | `findOrCreateByUsername(username: string): Promise<Player>` — **throws** `PersistenceError` (R-DB1, 3.2.1) |
| `MatchRepository` | — | `recordMatch(match: Match, participants: MatchParticipant[]): Promise<void>` — **throws** `PersistenceError` (R7.1, R-DB2, R-DB4); `findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchParticipant[]>` (R7.3, R-DB5) |
| `LeaderboardEntry` | `playerId, username, wins, losses, draws, gamesPlayed, winRate` | `constructor(...)`; `static fromRow(row): LeaderboardEntry` |
| `LeaderboardRepository` | — | `computeLeaderboard(minGames: number): Promise<LeaderboardEntry[]>` (R8.1, R8.2); `computeChampionWinRates(): Promise<ChampionWinRateDTO[]>` (R8.3) |
| `PendingMatchCorrelator` | `private pending: Map<MatchId, Partial<{begin, end}>>` | `recordBegin(matchId: MatchId, participants: {...}): void`; `recordEnd(matchId: MatchId, outcome: {...}): {begin, end} \| null` (returns the combined record only once both halves are present — SRS 3.2.7.4 step 26) |

### 7b. `api/controller`

| Class | Extends | Operations |
|---|---|---|
| `InternalMatchController` | `extends AbstractController` | `POST /internal/matches/begin`, `POST /internal/matches/end` — receives `MatchReportingClient`'s calls, uses `PendingMatchCorrelator` then `MatchRepository.recordMatch()`; not exposed to players |
| `MatchHistoryController` | `extends AbstractController` | `GET /players/:id/matches?page=&pageSize=` (R7.3) |
| `LeaderboardController` | `extends AbstractController` | `GET /leaderboard`, `GET /leaderboard/champions` (R8.1–R8.3) |

### 7c. `api/view`

| Class | Implements | Responsibility |
|---|---|---|
| `LeaderboardResponseView` | — | Formats `LeaderboardEntry[]` → `LeaderboardEntryDTO[]` JSON |
| `MatchHistoryResponseView` | — | Formats `MatchParticipant[]` → paginated `MatchHistoryEntryDTO[]` JSON |
| `ErrorResponseView` | — | Formats a caught `ArenaError` into an HTTP status + JSON error body |

Unlike the server's broadcast views, these are plain formatter classes (a `render()` method only) — a
synchronous HTTP response has no push/observe relationship to establish, so implementing the full `View`
interface would be unused ceremony.

### 7d. `api/util` and entry point

| Class | Operations |
|---|---|
| `PgPool` | `constructor(connectionString: string)`; `query<T>(sql: string, params: unknown[]): Promise<T[]>` — **throws** `PersistenceError` |
| `ApiMain` | `static async main(): Promise<void>` — builds the Express app, wires middleware and the three controllers above to routes, connects `PgPool`, and listens on the configured port. |

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
- `AbstractController` holds exactly one `Model` and one `View` (1-to-1 per controller instance, matching "one controller instance per view instance" from the course examples).
- `*Repository` classes *depend on* `PgPool` (dependency, not ownership — the pool is shared/injected).

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
