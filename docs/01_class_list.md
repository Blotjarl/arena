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
now added to the row above. Also, `submitAbility`'s real parameter is the narrower inline
`{ abilityId: string; targetPlayerId?: string }`, not the full shared `AbilityUseRequest` this table
originally sketched — the implementation never reads `AbilityUseRequest.targetPosition` at all. See this
prompt's closing summary for why that specific gap is flagged as a real (not just documentation) issue: it
makes any `POSITIONING`-effect ability invoked without a `targetPlayerId` (i.e. every self-directed
reposition, such as Vex's Phase Step) resolve its own target to itself and therefore move nowhere.

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

---

## 6. `packages/client` (Raj) — the React browser client

### 6a. `client/model`

| Class | Extends | Attributes | Operations |
|---|---|---|---|
| `ClientIdentityModel` | `extends AbstractModel` | `playerId: PlayerId \| null`; `username: string \| null` | `constructor()`; `identify(username: string): void` (persists to `sessionStorage` per R1.2); `getPlayerId(): PlayerId` |
| `ClientQueueModel` | `extends AbstractModel` | `status: 'idle' \| 'queued' \| 'matched'`; `position: number \| null`; `matchPayload: MatchFoundPayload \| null` (the raw `match:found` payload, stored by `setMatched()`; read by `LobbyView`/`ChampionSelectView`/`ResultsView` for opponent username/team/roster) | `constructor()`; `setQueued(position: number): void`; `setCancelled(): void`; `setMatched(payload: MatchFoundPayload): void` |
| `ClientMatchModel` | `extends AbstractModel` | `matchId: MatchId \| null`; `phase: MatchPhase \| null` (null until a match is found — unlike server's `MatchModel`, which always has a phase from construction); `latestState: MatchStatePayload \| null`; `result: MatchEndPayload \| null`; `championSelection: ChampionSelectedPayload \| null` | `constructor()`; `applyChampionSelected(payload: ChampionSelectedPayload): void`; `applyMatchStart(payload: MatchStartPayload): void`; `applyMatchState(payload: MatchStatePayload): void` (R4.7 — read-only mirror, never mutates authoritative values itself); `applyMatchEnd(payload: MatchEndPayload): void` |
| `InterpolationBuffer` | — | `private samples: MatchStatePayload[]` (ring buffer) | `constructor(capacity: number)`; `push(snapshot: MatchStatePayload): void`; `getInterpolatedPosition(playerId: PlayerId, now: number): Position` (R4.7, R-P4 — smooths rendering between the server's 20Hz ticks without altering any authoritative value) |

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

**Undocumented, paired React components:** each `*View` class's `.tsx` file also exports a same-named
`*Screen` functional component (`LobbyScreen`, `ChampionSelectScreen`, `MatchHUDScreen`, `ResultsScreen`) —
the actual render target the `View` class's `bindUpdateCallback` triggers, per SRS 3.1.1. These are real,
separate, exported components with no row of their own in this table; only the four `View` classes above
are enumerated. `ClientMain.tsx`'s `wirePair` helper is also undocumented here.

### 6d. Entry point

| Class | Operations |
|---|---|
| `ClientMain` | `static main(socketFactory: () => Socket = () => io()): void` — mounts the React root, instantiates the model/controller graph, and renders the screen router (`src/index.tsx` calls `ClientMain.main()`). |

**Step 10 correction**: `main()` gained an optional `socketFactory` parameter, defaulting to a real `io()`
call, where this table originally sketched a zero-arg method — this lets `ClientMain.main()` be exercised
by a test without opening a live socket connection (master context §4.2's testability principle); a test
supplies a mock satisfying the same `emit`/`on` shape instead.

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
