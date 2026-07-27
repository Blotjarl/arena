import { Match, MatchParticipant, PlayerId, ChampionId, MatchId, MatchResult, EndReason } from '@arena/shared';
import { PgPool } from '../util/PgPool';

/**
 * One row of a player's match history, joined with the match's opponent (R7.3). `MatchParticipant` alone
 * can't carry `opponentUsername` — it's a fixed per-participant persistence row (`docs/01_class_list.md`
 * §4a) with no opponent reference — so `findHistoryForPlayer` returns this enriched shape instead, built by
 * a single query (a self-join on `match_participants`) rather than an N+1 follow-up lookup per row.
 */
export interface MatchHistoryRow {
  matchId: MatchId;
  opponentUsername: string;
  championId: ChampionId;
  result: MatchResult;
  endReason: EndReason;
  durationMs: number;
  endedAt: Date;
}

interface MatchHistoryQueryRow {
  match_id: string;
  opponent_username: string;
  champion_id: string;
  result: string;
  end_reason: string;
  duration_ms: number;
  ended_at: string;
}

function toMatchHistoryRow(row: MatchHistoryQueryRow): MatchHistoryRow {
  return {
    matchId: row.match_id,
    opponentUsername: row.opponent_username,
    championId: row.champion_id,
    result: row.result as MatchResult,
    endReason: row.end_reason as EndReason,
    durationMs: row.duration_ms,
    endedAt: new Date(row.ended_at),
  };
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
   *
   * CORRECTION (Step 10): originally returned `MatchParticipant[]`, but `MatchHistoryResponseView`
   * (`10_api_2`) needs each row's opponent username for `MatchHistoryEntryDTO` (R7.3's wire shape), and
   * `MatchParticipant` has no opponent reference. Real implementation joins `match_participants` to itself
   * (on `match_id`, excluding the querying player's own row — 1v1 matches always have exactly one other
   * participant) plus `players` for that opponent's username, in one query, and returns the enriched
   * `MatchHistoryRow` shape instead.
   * @param playerId - the player whose history to fetch
   * @param page - 1-indexed page number
   * @param pageSize - number of entries per page
   * @returns the page of `MatchHistoryRow`s for that player
   * @throws {PersistenceError} if the underlying query fails
   */
  async findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchHistoryRow[]> {
    const offset = (page - 1) * pageSize;
    const rows = await this.pool.query<MatchHistoryQueryRow>(
      `SELECT
         mp.match_id AS match_id,
         opp.username AS opponent_username,
         mp.champion_id AS champion_id,
         mp.result AS result,
         m.end_reason AS end_reason,
         m.duration_ms AS duration_ms,
         m.ended_at AS ended_at
       FROM match_participants mp
       JOIN matches m ON m.id = mp.match_id
       JOIN match_participants opp_mp ON opp_mp.match_id = mp.match_id AND opp_mp.player_id != mp.player_id
       JOIN players opp ON opp.id = opp_mp.player_id
       WHERE mp.player_id = $1
       ORDER BY m.ended_at DESC
       LIMIT $2 OFFSET $3`,
      [playerId, pageSize, offset],
    );
    return rows.map(toMatchHistoryRow);
  }
}
