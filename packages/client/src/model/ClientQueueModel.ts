import { AbstractModel, MatchFoundPayload, NotImplementedError } from '@arena/shared';

export type QueueStatus = 'idle' | 'queued' | 'matched';

export class ClientQueueModel extends AbstractModel {
  public status: QueueStatus = 'idle';
  public position: number | null = null;

  setQueued(position: number): void {
    throw new NotImplementedError('ClientQueueModel.setQueued not yet implemented');
  }

  setCancelled(): void {
    throw new NotImplementedError('ClientQueueModel.setCancelled not yet implemented');
  }

  setMatched(payload: MatchFoundPayload): void {
    throw new NotImplementedError('ClientQueueModel.setMatched not yet implemented');
  }
}
