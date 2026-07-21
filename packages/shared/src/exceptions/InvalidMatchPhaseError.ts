import { ArenaError } from './ArenaError';
import { MatchId } from '../domain/ids';

export class InvalidMatchPhaseError extends ArenaError {
  readonly code = 'INVALID_MATCH_PHASE';
  constructor(matchId: MatchId, expected: string, actual: string) {
    super(`Match ${matchId} expected phase ${expected} but was ${actual}.`);
  }
}
