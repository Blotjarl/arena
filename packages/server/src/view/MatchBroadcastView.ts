import { View, ModelListener, ModelEvent, PlayerId, NotImplementedError } from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchModel } from '../model/MatchModel';

export class MatchBroadcastView implements View, ModelListener {
  constructor(
    private model: MatchModel,
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

  getController(): never {
    throw new NotImplementedError('MatchBroadcastView.getController is not applicable');
  }

  setController(): void {
    throw new NotImplementedError('MatchBroadcastView.setController is not applicable');
  }

  /** Switches on event.type to emit champion:selected / match:start / match:state / match:end / match:player_disconnected / match:player_reconnected. */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchBroadcastView.modelChanged not yet implemented');
  }
}
