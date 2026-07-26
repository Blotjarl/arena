import { AbstractModel, MatchFoundPayload } from '@arena/shared';

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

  /** The match:found payload from the server; null until setMatched() is called. */
  public matchPayload: MatchFoundPayload | null = null;

  /**
   * Records that the player has entered the queue at the given position (R2.3).
   * @param position - 1-based queue position as reported by the server
   */
  setQueued(position: number): void {
    this.status = 'queued';
    this.position = position;
  }

  /**
   * Records that the player has left the queue (cancelled or timed out) (R2.5).
   */
  setCancelled(): void {
    this.status = 'idle';
    this.position = null;
  }

  /**
   * Records that a match has been found and stores the server's match-found payload (R2.6).
   * @param payload - the match:found event payload from the server
   */
  setMatched(payload: MatchFoundPayload): void {
    this.status = 'matched';
    this.position = null;
    this.matchPayload = payload;
  }
}
