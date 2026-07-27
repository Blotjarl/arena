# Prompt 10_client_1 — SocketConnectionController Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`packages/client`'s model package (`09_client_1`–`09_client_3`) must already be merged — this class routes
every inbound event into `ClientIdentityModel`/`ClientQueueModel`/`ClientMatchModel`'s existing `apply*`/
`set*` methods, which must exist and behave exactly as `09_client_1`/`09_client_2` left them.

### CRITICAL: never open a real socket in a test
Per master context §4.2's testability principle (the same one `ConnectionHandler` follows on the server
side), this class must be constructible and fully exercisable with a **mock** satisfying the `emit`/`on`
shape — never call `io(...)` or open a live connection inside `SocketConnectionController` itself, and
never do so in this prompt's tests.

---

### Design note — one signature correction

**The stub's constructor took only `models` — with no socket reference, `operation()` would have had
nothing to emit on.** `docs/01_class_list.md` §6b sketches `constructor(models: {...})`, but that leaves no
way to actually send anything over the wire. A Socket.IO client socket (or, in tests, a mock satisfying the
same `emit`/`on` shape) is now constructor-injected as the *first* parameter, `models` second. This mirrors
exactly how `ConnectionHandler` takes a `Socket` on the server side (`docs/01_class_list.md` §5b) — update
the class list's `SocketConnectionController` row to `constructor(socket: Socket, models: ClientModels)` in
the same commit as this implementation.

**`match:player_disconnected`, `match:player_reconnected`, and `error` are deliberately not routed to any
model.** No client model has a matching `apply*`/`set*` slot for them (`docs/01_class_list.md` §6a lists
exactly four `apply*` methods on `ClientMatchModel`, none for these three). Disconnect/reconnect status is
already carried on every `match:state` tick via `ParticipantSnapshot.connectionStatus`
(`packages/shared/src/contract/payloads.ts`), so no separate model field is needed for it — a future view
wanting a transient "player disconnected" banner can listen to the raw socket event directly rather than
this controller inventing a new model field for it. Do not add handlers for these three events.

---

### 1. Replace `packages/client/src/controller/SocketConnectionController.ts` with:

```ts
import type { Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  QueueJoinedPayload,
  MatchFoundPayload,
  ChampionSelectedPayload,
  MatchStartPayload,
  MatchStatePayload,
  MatchEndPayload,
} from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { ClientMatchModel } from '../model/ClientMatchModel';

/** Typed bundle of the three client models that SocketConnectionController routes events into. */
export interface ClientModels {
  identity: ClientIdentityModel;
  queue: ClientQueueModel;
  match: ClientMatchModel;
}

/**
 * Thin adapter that owns the Socket.IO client connection: emits outbound action payloads and
 * routes inbound server events to the corresponding model's apply*() method (2.3, R-D2).
 * This class is intentionally kept as a shallow adapter — all business logic lives in the models
 * and domain controllers, not here. See master context §4.2 (testability without a live socket).
 */
export class SocketConnectionController {
  /**
   * CORRECTION (Step 10): the stub's constructor took only `models` — with no socket reference,
   * `operation()` would have nothing to emit on. A real Socket.IO client (or, in tests, a mock
   * satisfying the same `emit`/`on` shape) is now constructor-injected, exactly the same
   * testability principle `ConnectionHandler` follows on the server side (master context §4.2):
   * this class never calls `io(...)` itself, so tests never open a real connection.
   * @param socket - the already-connected (or mock) Socket.IO client socket
   * @param models - the three client models that inbound server events are dispatched into
   */
  constructor(
    private readonly socket: Socket,
    private readonly models: ClientModels,
  ) {
    this.bindInboundEvents();
  }

  /**
   * Emits a named action to the server over the Socket.IO connection.
   * If the socket is not currently connected (e.g. mid-disconnect), the emit is a no-op at the
   * Socket.IO layer — Socket.IO itself buffers/drops outbound emits while disconnected; this
   * method never throws for that reason.
   * @param action - the Socket.IO event name to emit (e.g. 'identify', 'queue:join')
   * @param payload - optional data to attach to the event
   */
  operation(action: string, payload?: unknown): void {
    this.socket.emit(action, payload);
  }

  /**
   * Registers listeners for all inbound server events and dispatches each to the matching
   * model's apply*() method. Called once during initialisation; must not be called again.
   *
   * `match:player_disconnected`, `match:player_reconnected`, and `error` are deliberately not
   * routed to any model here — no client model has a matching apply()/set() slot for them (see
   * `docs/01_class_list.md` §6a). Disconnect/reconnect status is already carried on every
   * `match:state` tick via `ParticipantSnapshot.connectionStatus`, so no separate model field is
   * needed for it; a view wanting a transient "player disconnected" banner can listen to the raw
   * socket event directly rather than this controller inventing a new model field for it.
   */
  private bindInboundEvents(): void {
    this.socket.on(SOCKET_EVENTS.QUEUE_JOINED, (payload: QueueJoinedPayload) => {
      this.models.queue.setQueued(payload.position);
    });
    this.socket.on(SOCKET_EVENTS.QUEUE_CANCELLED, () => {
      this.models.queue.setCancelled();
    });
    this.socket.on(SOCKET_EVENTS.MATCH_FOUND, (payload: MatchFoundPayload) => {
      this.models.queue.setMatched(payload);
    });
    this.socket.on(SOCKET_EVENTS.CHAMPION_SELECTED, (payload: ChampionSelectedPayload) => {
      this.models.match.applyChampionSelected(payload);
    });
    this.socket.on(SOCKET_EVENTS.MATCH_START, (payload: MatchStartPayload) => {
      this.models.match.applyMatchStart(payload);
    });
    this.socket.on(SOCKET_EVENTS.MATCH_STATE, (payload: MatchStatePayload) => {
      this.models.match.applyMatchState(payload);
    });
    this.socket.on(SOCKET_EVENTS.MATCH_END, (payload: MatchEndPayload) => {
      this.models.match.applyMatchEnd(payload);
    });
  }
}
```

### 2. Create `packages/client/src/controller/SocketConnectionController.test.ts` with:

```ts
import { Team, EndReason, MatchPhase } from '@arena/shared';
import { SocketConnectionController } from './SocketConnectionController';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { Socket } from 'socket.io-client';

function makeFakeSocket() {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const socket = {
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: jest.fn(),
  };
  return { socket: socket as unknown as Socket, handlers, emit: socket.emit };
}

function makeModels() {
  return { identity: new ClientIdentityModel(), queue: new ClientQueueModel(), match: new ClientMatchModel() };
}

describe('SocketConnectionController', () => {
  describe('operation', () => {
    it('emits the action and payload on the underlying socket', () => {
      const { socket, emit } = makeFakeSocket();
      const controller = new SocketConnectionController(socket, makeModels());

      controller.operation('queue:join', { foo: 'bar' });

      expect(emit).toHaveBeenCalledWith('queue:join', { foo: 'bar' });
    });

    it('emits with no payload when none is given', () => {
      const { socket, emit } = makeFakeSocket();
      const controller = new SocketConnectionController(socket, makeModels());

      controller.operation('queue:cancel');

      expect(emit).toHaveBeenCalledWith('queue:cancel', undefined);
    });
  });

  describe('bindInboundEvents (exercised via construction)', () => {
    it('registers a listener for every inbound server event exactly once', () => {
      const { socket, handlers } = makeFakeSocket();
      new SocketConnectionController(socket, makeModels());

      for (const event of [
        'queue:joined',
        'queue:cancelled',
        'match:found',
        'champion:selected',
        'match:start',
        'match:state',
        'match:end',
      ]) {
        expect(handlers.has(event)).toBe(true);
      }
    });

    it('routes queue:joined to ClientQueueModel.setQueued', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);

      handlers.get('queue:joined')!({ position: 4 });

      expect(models.queue.status).toBe('queued');
      expect(models.queue.position).toBe(4);
    });

    it('routes queue:cancelled to ClientQueueModel.setCancelled', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      models.queue.setQueued(2);
      new SocketConnectionController(socket, models);

      handlers.get('queue:cancelled')!({});

      expect(models.queue.status).toBe('idle');
      expect(models.queue.position).toBeNull();
    });

    it('routes match:found to ClientQueueModel.setMatched', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const payload = { matchId: 'm1', team: Team.A, opponentUsername: 'Bob', roster: [] };

      handlers.get('match:found')!(payload);

      expect(models.queue.status).toBe('matched');
      expect(models.queue.matchPayload).toBe(payload);
    });

    it('routes champion:selected to ClientMatchModel.applyChampionSelected', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const payload = { matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: false };

      handlers.get('champion:selected')!(payload);

      expect(models.match.championSelection).toBe(payload);
    });

    it('routes match:start to ClientMatchModel.applyMatchStart', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const initialState = { matchId: 'm1', tick: 0, participants: [] };

      handlers.get('match:start')!({ matchId: 'm1', initialState });

      expect(models.match.matchId).toBe('m1');
      expect(models.match.phase).toBe(MatchPhase.ACTIVE);
      expect(models.match.latestState).toBe(initialState);
    });

    it('routes match:state to ClientMatchModel.applyMatchState', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const state = { matchId: 'm1', tick: 5, participants: [] };

      handlers.get('match:state')!(state);

      expect(models.match.latestState).toBe(state);
    });

    it('routes match:end to ClientMatchModel.applyMatchEnd', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const payload = { matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 1000 };

      handlers.get('match:end')!(payload);

      expect(models.match.result).toBe(payload);
    });
  });
});
```

### 3. Update `docs/01_class_list.md` §6b (`SocketConnectionController` row)
Change the constructor signature in the table from `constructor(models: {...})` to
`constructor(socket: Socket, models: ClientModels)`, and add a row-note below the table: "**Step 10
correction**: `SocketConnectionController` gained a constructor-injected `socket: Socket` parameter during
implementation — without a socket reference, `operation()` had nothing to emit on. Mirrors
`ConnectionHandler`'s `Socket` parameter on the server side (§5b)."

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes; `npx jest SocketConnectionController
--coverage --collectCoverageFrom="src/controller/SocketConnectionController.ts"` — validated result: **10
tests passing, 100% statement/branch/function/line coverage**. Branch `client` from `main` (or reuse an
already-checked-out `client` branch), commit `Step 10: SocketConnectionController implementation and tests,
socket-injection constructor correction`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this class never opens a real socket connection itself, and its tests never open one either —
only a mock satisfying `emit`/`on`.** Every other client controller in this batch (`10_client_2` through
`10_client_4`) is built on top of this one; if its tests ever required a live connection, the whole batch
would inherit that fragility. Keep `SocketConnectionController` a pure adapter over an injected socket.
