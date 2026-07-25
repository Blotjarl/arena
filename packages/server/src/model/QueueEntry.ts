import { PlayerId } from '@arena/shared';

/** One player's entry in the matchmaking queue, in FIFO order by `joinedAt`. */
export class QueueEntry {
  constructor(
    /** The waiting player's stable identifier. */
    public readonly playerId: PlayerId,
    /** The waiting player's display username, so a pairing can announce an opponent without a lookup. */
    public readonly username: string,
    /** Timestamp (ms) the player joined the queue — the ordering key for pairing (R2.4). */
    public readonly joinedAt: number,
  ) {}
}
