import { ChampionWinRateDTO } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { LeaderboardEntry } from './LeaderboardEntry';

interface ChampionWinRateRow {
  champion_id: string;
  games_played: string;
  win_rate: string;
}

/** Computes leaderboard standings and per-champion win rates from recorded match history (R8.1–R8.3). */
export class LeaderboardRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Computes each qualifying player's win rate. Win rate is always derived fresh from match history at
   * query time — wins / gamesPlayed, computed by the query itself via `FILTER`/`COUNT`, not as a
   * separately maintained value (R8.1); this is a correctness property, not an implementation detail, so
   * it should not be "optimized" into an incrementally updated counter later. Players below `minGames`
   * are excluded via `HAVING`, not filtered client-side (R8.2). Ordered by win rate, then total wins,
   * descending.
   * @param minGames - minimum games played to qualify for inclusion (R8.2, default 1 — see
   *   `prompts/00_master_context.md` §4.1)
   * @returns qualifying players' leaderboard entries
   * @throws {PersistenceError} if the underlying query fails
   */
  async computeLeaderboard(minGames: number): Promise<LeaderboardEntry[]> {
    const rows = await this.pool.query<Record<string, unknown>>(
      `SELECT
         mp.player_id AS player_id,
         p.username AS username,
         COUNT(*) FILTER (WHERE mp.result = 'WIN') AS wins,
         COUNT(*) FILTER (WHERE mp.result = 'LOSS') AS losses,
         COUNT(*) FILTER (WHERE mp.result = 'DRAW') AS draws,
         COUNT(*) AS games_played,
         (COUNT(*) FILTER (WHERE mp.result = 'WIN'))::float / COUNT(*) AS win_rate
       FROM match_participants mp
       JOIN players p ON p.id = mp.player_id
       GROUP BY mp.player_id, p.username
       HAVING COUNT(*) >= $1
       ORDER BY win_rate DESC, wins DESC`,
      [minGames],
    );
    return rows.map((row) => LeaderboardEntry.fromRow(row));
  }

  /**
   * Computes each champion's aggregate win rate across all recorded matches (R8.3), the same
   * computed-at-query-time way as `computeLeaderboard` (R8.1's correctness property applies equally here).
   * @returns one win-rate summary per champion
   * @throws {PersistenceError} if the underlying query fails
   */
  async computeChampionWinRates(): Promise<ChampionWinRateDTO[]> {
    const rows = await this.pool.query<ChampionWinRateRow>(
      `SELECT
         champion_id AS champion_id,
         COUNT(*) AS games_played,
         (COUNT(*) FILTER (WHERE result = 'WIN'))::float / COUNT(*) AS win_rate
       FROM match_participants
       GROUP BY champion_id
       ORDER BY win_rate DESC`,
      [],
    );
    return rows.map((row) => ({
      championId: row.champion_id,
      gamesPlayed: Number(row.games_played),
      winRate: Number(row.win_rate),
    }));
  }
}
