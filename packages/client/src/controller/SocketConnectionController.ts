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
