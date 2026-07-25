import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

/** Thrown when a player attempts to cancel matchmaking while not actually queued (R2.3). */
export class NotQueuedError extends ArenaError {
  readonly code = 'NOT_QUEUED';

  /** @param playerId - the player who attempted to cancel */
  constructor(playerId: PlayerId) {
    super(`Player ${playerId} is not currently queued.`);
  }
}
