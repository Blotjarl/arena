import { AbstractModel, Player, PlayerId, NotImplementedError } from '@arena/shared';
import { QueueEntry } from './QueueEntry';

/**
 * The FIFO pool of identified players waiting to be paired into a match (R2.1–R2.6). One process-wide
 * instance, observed by `MatchmakingBroadcastView` via `AbstractModel`'s `ModelListener` mechanism.
 */
export class MatchmakingQueue extends AbstractModel {
  private entries: QueueEntry[] = [];
  private activeMatchCount = 0;

  constructor(
    /** Upper bound on matches running concurrently (R-P3); pairing is withheld once reached. */
    private readonly maxConcurrentMatches: number,
  ) {
    super();
  }

  /**
   * Adds a player to the back of the queue.
   * @param player - the identified player joining the queue
   * @returns the player's 1-based position in the queue
   * @throws {AlreadyQueuedError} if the player is already queued or already in an active match (R2.2)
   */
  join(player: Player): number {
    throw new NotImplementedError('MatchmakingQueue.join not yet implemented');
  }

  /**
   * Removes a player from the queue before they've been paired.
   * @param playerId - the player to remove
   * @throws {NotQueuedError} if playerId is not currently queued (R2.3)
   */
  cancel(playerId: PlayerId): void {
    throw new NotImplementedError('MatchmakingQueue.cancel not yet implemented');
  }

  /**
   * Attempts to pair the two longest-waiting entries, if a match slot is free under
   * `maxConcurrentMatches` (R2.4, R2.5). Does not itself construct a `MatchModel` — the caller
   * (`MatchmakingController`) does that with the returned pair.
   * @returns the two paired entries, removed from the queue, or null if no pairing is currently possible
   */
  tryPairNext(): [QueueEntry, QueueEntry] | null {
    throw new NotImplementedError('MatchmakingQueue.tryPairNext not yet implemented');
  }

  /** @returns the number of players currently waiting in the queue. */
  size(): number {
    return this.entries.length;
  }
}
