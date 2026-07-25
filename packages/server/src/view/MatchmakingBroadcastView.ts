import { View, ModelListener, ModelEvent, PlayerId, NotImplementedError } from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchmakingQueue } from '../model/MatchmakingQueue';

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
   * @param event - the model-pushed change to broadcast
   */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchmakingBroadcastView.modelChanged not yet implemented');
  }
}
