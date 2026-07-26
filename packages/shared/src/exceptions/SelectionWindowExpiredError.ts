import { ArenaError } from './ArenaError';
import { MatchId } from '../domain/ids';

/** Thrown when a player attempts to select a champion after the 30-second selection window closes (R3.4). */
export class SelectionWindowExpiredError extends ArenaError {
  readonly code = 'SELECTION_WINDOW_EXPIRED';

  /** @param matchId - the match whose selection window has expired */
  constructor(matchId: MatchId) {
    super(`Champion selection window for match ${matchId} has expired.`);
  }
}
