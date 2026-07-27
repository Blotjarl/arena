import {
  View,
  ModelListener,
  ModelEvent,
  PlayerId,
  NotImplementedError,
  ChampionSelectedPayload,
  MatchStartPayload,
  MatchStatePayload,
  MatchEndPayload,
  PlayerDisconnectedPayload,
  PlayerReconnectedPayload,
  ErrorPayload,
  SOCKET_EVENTS,
} from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchModel } from '../model/MatchModel';

/**
 * Socket.IO broadcaster for one MatchModel's changes — the server's concrete View realization for combat
 * (no JFrameView equivalent, see docs/01_class_list.md §1). A pure observer with no paired controller: it
 * never receives player input, only pushes match state out at up to 20Hz (R-P2).
 */
export class MatchBroadcastView implements View, ModelListener {
  constructor(
    private model: MatchModel,
    /** This match's two participants' sockets, keyed by playerId, for targeted and paired emission. */
    private sockets: Map<PlayerId, Socket>,
  ) {
    this.model.addModelListener(this);
  }

  getModel(): MatchModel {
    return this.model;
  }

  setModel(model: MatchModel): void {
    this.model = model;
  }

  /**
   * Not applicable — a pure broadcaster has no paired controller to return (docs/01_class_list.md §5c
   * note). Stubbed to throw rather than implemented; do not treat this as an ArenaError-style domain
   * exception, it signals a programming error if ever called.
   */
  getController(): never {
    throw new NotImplementedError('MatchBroadcastView.getController is not applicable');
  }

  /** Not applicable, for the same reason as getController() above. */
  setController(): void {
    throw new NotImplementedError('MatchBroadcastView.setController is not applicable');
  }

  private broadcast(eventName: string, payload: unknown): void {
    for (const socket of this.sockets.values()) {
      socket.emit(eventName, payload);
    }
  }

  /**
   * Reacts to a MatchModel change by emitting the corresponding Socket.IO event: `champion:selected`,
   * `match:start`, `match:state`, `match:end`, `match:player_disconnected`, or `match:player_reconnected`
   * are broadcast to both of this match's sockets (this.sockets is scoped to exactly this match's two
   * participants, per constructor). `error` (CORRECTION, Step 10 — added by `ChampionSelectController` to
   * carry a per-player validation failure, docs/01_class_list.md §5b) is targeted at just the one player
   * named in its payload, since it is not participant-symmetric like the others.
   * MatchModel's own internal event type strings ('state', 'player_disconnected', 'player_reconnected')
   * differ from their wire event names — translating between the two is this method's job.
   * @param event - the model-pushed change to broadcast
   */
  modelChanged(event: ModelEvent): void {
    switch (event.type) {
      case 'champion:selected':
        this.broadcast(SOCKET_EVENTS.CHAMPION_SELECTED, event.payload as ChampionSelectedPayload);
        break;
      case 'match:start':
        this.broadcast(SOCKET_EVENTS.MATCH_START, event.payload as MatchStartPayload);
        break;
      case 'state':
        this.broadcast(SOCKET_EVENTS.MATCH_STATE, event.payload as MatchStatePayload);
        break;
      case 'match:end':
        this.broadcast(SOCKET_EVENTS.MATCH_END, event.payload as MatchEndPayload);
        break;
      case 'player_disconnected':
        this.broadcast(SOCKET_EVENTS.MATCH_PLAYER_DISCONNECTED, event.payload as PlayerDisconnectedPayload);
        break;
      case 'player_reconnected':
        this.broadcast(SOCKET_EVENTS.MATCH_PLAYER_RECONNECTED, event.payload as PlayerReconnectedPayload);
        break;
      case 'error': {
        const { playerId, ...rest } = event.payload as { playerId: PlayerId } & ErrorPayload;
        this.sockets.get(playerId)?.emit(SOCKET_EVENTS.ERROR, rest as ErrorPayload);
        break;
      }
    }
  }
}
