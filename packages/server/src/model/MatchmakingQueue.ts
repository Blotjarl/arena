import {
  AbstractModel,
  Player,
  PlayerId,
  ModelEvent,
  AlreadyQueuedError,
  NotQueuedError,
} from '@arena/shared';
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
    if (this.entries.some((e) => e.playerId === player.id)) {
      throw new AlreadyQueuedError(player.id);
    }
    this.entries.push(new QueueEntry(player.id, player.username, Date.now()));
    const position = this.entries.length;
    this.notifyChanged(new ModelEvent(this, 'queue:joined', { playerId: player.id, position }));
    return position;
  }

  /**
   * Removes a player from the queue before they've been paired.
   * @param playerId - the player to remove
   * @throws {NotQueuedError} if playerId is not currently queued (R2.3)
   */
  cancel(playerId: PlayerId): void {
    const index = this.entries.findIndex((e) => e.playerId === playerId);
    if (index === -1) {
      throw new NotQueuedError(playerId);
    }
    this.entries.splice(index, 1);
    this.notifyChanged(new ModelEvent(this, 'queue:cancelled', { playerId }));
  }

  /**
   * Attempts to pair the two longest-waiting entries, if a match slot is free under
   * `maxConcurrentMatches` (R2.4, R2.5). Does not itself construct a `MatchModel` — the caller
   * (`MatchmakingController`) does that with the returned pair.
   *
   * Deliberately does not notifyChanged() on a successful pairing: `match:found`'s payload
   * (`matchId`, per-player `team`/`opponentUsername`, `roster`) doesn't exist until the caller builds the
   * actual `MatchModel`, and it differs per player — unlike every other event this class emits, it can't be
   * a single broadcast to all listeners. Broadcasting it is `MatchmakingController`/`MatchmakingBroadcastView`'s
   * job once the match is constructed, not this method's.
   * @returns the two paired entries, removed from the queue, or null if no pairing is currently possible
   */
  tryPairNext(): [QueueEntry, QueueEntry] | null {
    if (this.entries.length < 2) return null;
    if (this.activeMatchCount >= this.maxConcurrentMatches) return null;
    const [first, second] = this.entries.splice(0, 2);
    this.activeMatchCount += 1;
    return [first, second];
  }

  /** @returns the number of players currently waiting in the queue. */
  size(): number {
    return this.entries.length;
  }
}
