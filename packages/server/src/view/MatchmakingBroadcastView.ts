import {
  View,
  ModelListener,
  ModelEvent,
  PlayerId,
  NotImplementedError,
  QueueJoinedPayload,
  QueueCancelledPayload,
  MatchFoundPayload,
  SOCKET_EVENTS,
} from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchmakingQueue } from '../model/MatchmakingQueue';
import type { MatchFoundBroadcast } from '../controller/MatchmakingController';

/**
 * Socket.IO broadcaster for MatchmakingQueue changes — the server's concrete View realization for
 * matchmaking, since Arena has no desktop GUI (no JFrameView equivalent, see docs/01_class_list.md §1).
 * A pure observer with no paired controller: it never receives player input, only pushes queue state out.
 */
export class MatchmakingBroadcastView implements View, ModelListener {
  constructor(
    private model: MatchmakingQueue,
    /** Every currently-connected player's socket, keyed by playerId, for targeted emission. */
    private sockets: Map<PlayerId, Socket>,
  ) {
    this.model.addModelListener(this);
  }

  getModel(): MatchmakingQueue {
    return this.model;
  }

  setModel(model: MatchmakingQueue): void {
    this.model = model;
  }

  /**
   * Not applicable — a pure broadcaster has no paired controller to return (docs/01_class_list.md §5c
   * note). Stubbed to throw rather than implemented; do not treat this as an ArenaError-style domain
   * exception, it signals a programming error if ever called.
   */
  getController(): never {
    throw new NotImplementedError('MatchmakingBroadcastView.getController is not applicable');
  }

  /** Not applicable, for the same reason as getController() above. */
  setController(): void {
    throw new NotImplementedError('MatchmakingBroadcastView.setController is not applicable');
  }

  /**
   * Reacts to a MatchmakingQueue change by emitting the corresponding Socket.IO event to the affected
   * player(s): `queue:joined`, `queue:cancelled`, or `match:found`, depending on event.type.
   *
   * CORRECTION (Step 10): `MatchmakingQueue.join`/`cancel`'s internal ModelEvent payload now includes
   * `playerId` (previously just `{position}` / `{}`) — without it, this view had no way to know which
   * single socket a `queue:joined`/`queue:cancelled` broadcast belongs to. `playerId` is stripped back out
   * before emitting, since it is not part of the wire-contract `QueueJoinedPayload`/`QueueCancelledPayload`
   * shapes the client actually receives. `match:found` is never auto-triggered by the model (see
   * `MatchmakingQueue.tryPairNext`'s own doc comment) — `MatchmakingController` calls this method directly,
   * once per paired player, once a real `MatchModel` exists (10_server_2).
   * @param event - the model-pushed change to broadcast
   */
  modelChanged(event: ModelEvent): void {
    switch (event.type) {
      case 'queue:joined': {
        const { playerId, position } = event.payload as { playerId: PlayerId; position: number };
        const payload: QueueJoinedPayload = { position };
        this.sockets.get(playerId)?.emit(SOCKET_EVENTS.QUEUE_JOINED, payload);
        break;
      }
      case 'queue:cancelled': {
        const { playerId } = event.payload as { playerId: PlayerId };
        const payload: QueueCancelledPayload = {};
        this.sockets.get(playerId)?.emit(SOCKET_EVENTS.QUEUE_CANCELLED, payload);
        break;
      }
      case 'match:found': {
        const { playerId, ...payload } = event.payload as MatchFoundBroadcast;
        this.sockets.get(playerId)?.emit(SOCKET_EVENTS.MATCH_FOUND, payload as MatchFoundPayload);
        break;
      }
    }
  }
}
