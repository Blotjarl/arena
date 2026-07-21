import { PlayerId } from '@arena/shared';
import { NotImplementedError } from '@arena/shared';

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
   * Builds a `LeaderboardEntry` from one aggregated query result row.
   * @param row - a raw row returned by `LeaderboardRepository.computeLeaderboard`'s query
   * @returns the corresponding `LeaderboardEntry`
   */
  static fromRow(row: Record<string, unknown>): LeaderboardEntry {
    throw new NotImplementedError('LeaderboardEntry.fromRow not yet implemented');
  }
}
