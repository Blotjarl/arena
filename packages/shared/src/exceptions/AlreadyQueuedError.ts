import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

/**
 * Thrown when a player attempts to join the matchmaking queue while already queued or in an active
 * match (R2.2).
 */
export class AlreadyQueuedError extends ArenaError {
  readonly code = 'ALREADY_QUEUED';

  /** @param playerId - the player who attempted to queue again */
  constructor(playerId: PlayerId) {
    super(`Player ${playerId} is already queued or in an active match.`);
  }
}
