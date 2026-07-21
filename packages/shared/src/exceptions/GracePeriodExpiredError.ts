import { ArenaError } from './ArenaError';
import { PlayerId, MatchId } from '../domain/ids';

export class GracePeriodExpiredError extends ArenaError {
  readonly code = 'GRACE_PERIOD_EXPIRED';
  constructor(playerId: PlayerId, matchId: MatchId) {
    super(`Player ${playerId}'s reconnect grace period for match ${matchId} has expired.`);
  }
}
