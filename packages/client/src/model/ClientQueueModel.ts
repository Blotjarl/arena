import { AbstractModel, MatchFoundPayload, NotImplementedError } from '@arena/shared';

/** Lifecycle state of the local player's position in the matchmaking queue (R2.1–R2.6). */
export type QueueStatus = 'idle' | 'queued' | 'matched';

/**
 * Tracks the local player's matchmaking queue state as reported by the server.
 * The server is authoritative — this model only stores what it has been told.
 */
export class ClientQueueModel extends AbstractModel {
  /** Current queue lifecycle state; starts idle and transitions on server events. */
  public status: QueueStatus = 'idle';

  /** 1-based position in the queue as last reported by the server; null when not queued. */
  public position: number | null = null;

  /**
   * Records that the player has entered the queue at the given position (R2.3).
   * @param position - 1-based queue position as reported by the server
   */
  setQueued(position: number): void {
    throw new NotImplementedError('ClientQueueModel.setQueued not yet implemented');
  }

  /**
   * Records that the player has left the queue (cancelled or timed out) (R2.5).
   */
  setCancelled(): void {
    throw new NotImplementedError('ClientQueueModel.setCancelled not yet implemented');
  }

  /**
   * Records that a match has been found and stores the server's match-found payload (R2.6).
   * @param payload - the match:found event payload from the server
   */
  setMatched(payload: MatchFoundPayload): void {
    throw new NotImplementedError('ClientQueueModel.setMatched not yet implemented');
  }
}
