import { ChampionWinRateDTO, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { LeaderboardEntry } from './LeaderboardEntry';

/** Computes leaderboard standings and per-champion win rates from recorded match history (R8.1–R8.3). */
export class LeaderboardRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Computes each qualifying player's win rate. Win rate is always derived fresh from match history at
   * query time — wins / gamesPlayed — not a maintained running total (R8.1); this is a correctness
   * property, not an implementation detail, so it should not be "optimized" into an incrementally updated
   * counter later.
   * @param minGames - minimum games played to qualify for inclusion (R8.2, default 1 — see
   *   `prompts/00_master_context.md` §4.1)
   * @returns qualifying players' leaderboard entries
   * @throws {PersistenceError} if the underlying query fails
   */
  async computeLeaderboard(minGames: number): Promise<LeaderboardEntry[]> {
    throw new NotImplementedError('LeaderboardRepository.computeLeaderboard not yet implemented');
  }

  /**
   * Computes each champion's aggregate win rate across all recorded matches (R8.3).
   * @returns one win-rate summary per champion
   * @throws {PersistenceError} if the underlying query fails
   */
  async computeChampionWinRates(): Promise<ChampionWinRateDTO[]> {
    throw new NotImplementedError('LeaderboardRepository.computeChampionWinRates not yet implemented');
  }
}
