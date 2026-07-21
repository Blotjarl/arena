import { AbstractModel, Player, PlayerId, NotImplementedError } from '@arena/shared';
import { QueueEntry } from './QueueEntry';

export class MatchmakingQueue extends AbstractModel {
  private entries: QueueEntry[] = [];
  private activeMatchCount = 0;

  constructor(private readonly maxConcurrentMatches: number) {
    super();
  }

  /** @throws AlreadyQueuedError if player is already queued or in an active match. Returns 1-based position. */
  join(player: Player): number {
    throw new NotImplementedError('MatchmakingQueue.join not yet implemented');
  }

  /** @throws NotQueuedError if playerId is not currently queued. */
  cancel(playerId: PlayerId): void {
    throw new NotImplementedError('MatchmakingQueue.cancel not yet implemented');
  }

  /** Pairs the two longest-waiting entries if a match slot is free (R2.4, R2.5); null otherwise. */
  tryPairNext(): [QueueEntry, QueueEntry] | null {
    throw new NotImplementedError('MatchmakingQueue.tryPairNext not yet implemented');
  }

  size(): number {
    return this.entries.length;
  }
}
