import { ArenaError } from './ArenaError';
import { MatchId } from '../domain/ids';

/** Thrown when a `MatchModel` operation is called while the match is in the wrong phase (guards R3–R5). */
export class InvalidMatchPhaseError extends ArenaError {
  readonly code = 'INVALID_MATCH_PHASE';

  /**
   * @param matchId - the match that was in the wrong phase
   * @param expected - the phase the operation required
   * @param actual - the phase the match was actually in
   */
  constructor(matchId: MatchId, expected: string, actual: string) {
    super(`Match ${matchId} expected phase ${expected} but was ${actual}.`);
  }
}
