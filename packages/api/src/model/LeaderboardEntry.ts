import { PlayerId } from '@arena/shared';

/** One player's aggregate leaderboard standing, derived from match history (R8.1, R8.2). */
export class LeaderboardEntry {
  constructor(
    /** The player this row summarizes. */
    public readonly playerId: PlayerId,
    /** The player's display username at aggregation time. */
    public readonly username: string,
    /** Total matches won. */
    public readonly wins: number,
    /** Total matches lost. */
    public readonly losses: number,
    /** Total matches drawn. */
    public readonly draws: number,
    /** Total matches counted (wins + losses + draws). */
    public readonly gamesPlayed: number,
    /** wins / gamesPlayed, as computed by the query that produced this row. */
    public readonly winRate: number,
  ) {}

  /**
   * Builds a `LeaderboardEntry` from one aggregated query result row. Expects the row to carry the
   * columns `player_id`, `username`, `wins`, `losses`, `draws`, `games_played`, `win_rate` — the aliases
   * `LeaderboardRepository.computeLeaderboard`'s query produces (`pg` returns `COUNT`/`SUM` aggregates as
   * strings, hence the `Number(...)` conversions below).
   * @param row - a raw row returned by `LeaderboardRepository.computeLeaderboard`'s query
   * @returns the corresponding `LeaderboardEntry`
   */
  static fromRow(row: Record<string, unknown>): LeaderboardEntry {
    return new LeaderboardEntry(
      row.player_id as PlayerId,
      row.username as string,
      Number(row.wins),
      Number(row.losses),
      Number(row.draws),
      Number(row.games_played),
      Number(row.win_rate),
    );
  }
}
