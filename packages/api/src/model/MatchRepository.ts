import { Match, MatchParticipant, PlayerId, Team, MatchResult } from '@arena/shared';
import { PgPool } from '../util/PgPool';

interface MatchParticipantRow {
  match_id: string;
  player_id: string;
  team: string;
  champion_id: string;
  result: string;
}

function toMatchParticipant(row: MatchParticipantRow): MatchParticipant {
  return new MatchParticipant(row.match_id, row.player_id, row.team as Team, row.champion_id, row.result as MatchResult);
}

/** Persists completed matches and serves paginated match history (R7.1, R7.3, R-DB2, R-DB5). */
export class MatchRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Writes one `Match` row plus its `MatchParticipant` rows (exactly one per player) as a single unit
   * (R7.1, R-DB2, R-DB4) — via `PgPool.transaction`, so a failure partway through leaves neither row
   * behind. Precondition: the match reached at least `ACTIVE` phase before ending — a match that ended
   * during Champion Select must not be recorded (R7.2). Enforcing that precondition is the caller's
   * (`InternalMatchController`'s) responsibility; this method persists whatever it is given.
   * @param match - the completed match's summary record
   * @param participants - the two participants' per-match outcome rows
   * @throws {PersistenceError} if the underlying write fails
   */
  async recordMatch(match: Match, participants: MatchParticipant[]): Promise<void> {
    await this.pool.transaction(async (query) => {
      await query(
        'INSERT INTO matches (id, end_reason, winning_team, duration_ms, ended_at) VALUES ($1, $2, $3, $4, $5)',
        [match.id, match.endReason, match.winningTeam, match.durationMs, match.endedAt],
      );
      for (const participant of participants) {
        await query(
          'INSERT INTO match_participants (match_id, player_id, team, champion_id, result) VALUES ($1, $2, $3, $4, $5)',
          [participant.matchId, participant.playerId, participant.team, participant.championId, participant.result],
        );
      }
    });
  }

  /**
   * Looks up a player's match history, most-recent-first (R7.3, R-DB5). `page` is 1-indexed — page 1 is
   * the most recent `pageSize` matches.
   * @param playerId - the player whose history to fetch
   * @param page - 1-indexed page number
   * @param pageSize - number of entries per page
   * @returns the page of `MatchParticipant` rows for that player
   * @throws {PersistenceError} if the underlying query fails
   */
  async findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchParticipant[]> {
    const offset = (page - 1) * pageSize;
    const rows = await this.pool.query<MatchParticipantRow>(
      `SELECT mp.match_id, mp.player_id, mp.team, mp.champion_id, mp.result
       FROM match_participants mp
       JOIN matches m ON m.id = mp.match_id
       WHERE mp.player_id = $1
       ORDER BY m.ended_at DESC
       LIMIT $2 OFFSET $3`,
      [playerId, pageSize, offset],
    );
    return rows.map(toMatchParticipant);
  }
}
