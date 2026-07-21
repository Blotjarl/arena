import { ChampionWinRateDTO, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { LeaderboardEntry } from './LeaderboardEntry';

export class LeaderboardRepository {
  constructor(private readonly pool: PgPool) {}

  /** Win rate = wins / gamesPlayed, derived from match history, not a running total (R8.1). Excludes
   *  players below minGames (R8.2, default 1 — see prompts/00_master_context.md §4.1). */
  async computeLeaderboard(minGames: number): Promise<LeaderboardEntry[]> {
    throw new NotImplementedError('LeaderboardRepository.computeLeaderboard not yet implemented');
  }

  async computeChampionWinRates(): Promise<ChampionWinRateDTO[]> {
    throw new NotImplementedError('LeaderboardRepository.computeChampionWinRates not yet implemented');
  }
}
