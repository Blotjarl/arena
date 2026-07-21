import { View, ModelListener, ModelEvent, PlayerId, NotImplementedError } from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchmakingQueue } from '../model/MatchmakingQueue';

export class MatchmakingBroadcastView implements View, ModelListener {
  constructor(
    private model: MatchmakingQueue,
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

  /** No natural controller pairing for a pure broadcaster — not applicable, see class-list note below. */
  getController(): never {
    throw new NotImplementedError('MatchmakingBroadcastView.getController is not applicable');
  }

  setController(): void {
    throw new NotImplementedError('MatchmakingBroadcastView.setController is not applicable');
  }

  /** Emits queue:joined / queue:cancelled / match:found depending on event.type. */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchmakingBroadcastView.modelChanged not yet implemented');
  }
}
