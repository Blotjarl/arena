import { ArenaError } from './ArenaError';
import { MatchId } from '../domain/ids';

export class SelectionWindowExpiredError extends ArenaError {
  readonly code = 'SELECTION_WINDOW_EXPIRED';
  constructor(matchId: MatchId) {
    super(`Champion selection window for match ${matchId} has expired.`);
  }
}
