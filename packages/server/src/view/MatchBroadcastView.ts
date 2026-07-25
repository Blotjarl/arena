import { View, ModelListener, ModelEvent, PlayerId, NotImplementedError } from '@arena/shared';
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

  /**
   * Reacts to a MatchModel change by emitting the corresponding Socket.IO event to both participants:
   * switches on event.type to emit `champion:selected`, `match:start`, `match:state`, `match:end`,
   * `match:player_disconnected`, or `match:player_reconnected`.
   * @param event - the model-pushed change to broadcast
   */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchBroadcastView.modelChanged not yet implemented');
  }
}
