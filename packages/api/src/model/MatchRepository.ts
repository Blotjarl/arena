import { Match, MatchParticipant, PlayerId, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';

/** Persists completed matches and serves paginated match history (R7.1, R7.3, R-DB2, R-DB5). */
export class MatchRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Writes one `Match` row plus its `MatchParticipant` rows (exactly one per player) as a single unit
   * (R7.1, R-DB2, R-DB4). Precondition: the match reached at least `ACTIVE` phase before ending — a match
   * that ended during Champion Select must not be recorded (R7.2). Enforcing that precondition is the
   * caller's (`InternalMatchController`'s) responsibility; this method persists whatever it is given.
   * @param match - the completed match's summary record
   * @param participants - the two participants' per-match outcome rows
   * @throws {PersistenceError} if the underlying write fails
   */
  async recordMatch(match: Match, participants: MatchParticipant[]): Promise<void> {
    throw new NotImplementedError('MatchRepository.recordMatch not yet implemented');
  }

  /**
   * Looks up a player's match history, most-recent-first (R7.3, R-DB5).
   * @param playerId - the player whose history to fetch
   * @param page - zero- or one-indexed page number (fixed by the implementation)
   * @param pageSize - number of entries per page
   * @returns the page of `MatchParticipant` rows for that player
   * @throws {PersistenceError} if the underlying query fails
   */
  async findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchParticipant[]> {
    throw new NotImplementedError('MatchRepository.findHistoryForPlayer not yet implemented');
  }
}
