import { ArenaError } from './ArenaError';
import { PlayerId, MatchId } from '../domain/ids';

/** Thrown when a player attempts to reconnect after their 30-second disconnect grace period has elapsed (R6.4). */
export class GracePeriodExpiredError extends ArenaError {
  readonly code = 'GRACE_PERIOD_EXPIRED';

  /**
   * @param playerId - the player attempting to reconnect
   * @param matchId - the match they were disconnected from
   */
  constructor(playerId: PlayerId, matchId: MatchId) {
    super(`Player ${playerId}'s reconnect grace period for match ${matchId} has expired.`);
  }
}
