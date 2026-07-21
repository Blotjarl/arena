import { Match, MatchParticipant, PlayerId, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';

export class MatchRepository {
  constructor(private readonly pool: PgPool) {}

  /** @throws PersistenceError — R7.1, R-DB2, R-DB4 (exactly one match-participant row per player). */
  async recordMatch(match: Match, participants: MatchParticipant[]): Promise<void> {
    throw new NotImplementedError('MatchRepository.recordMatch not yet implemented');
  }

  /** Most-recent-first, paginated (R7.3, R-DB5). */
  async findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchParticipant[]> {
    throw new NotImplementedError('MatchRepository.findHistoryForPlayer not yet implemented');
  }
}
