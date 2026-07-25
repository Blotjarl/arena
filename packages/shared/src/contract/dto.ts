import { MatchId, ChampionId } from '../domain/ids';
import { EndReason } from '../domain/EndReason';
import { MatchResult } from '../domain/MatchResult';

/** Sent server→client via REST, one row of a player's match history (R7.3). */
export interface MatchHistoryEntryDTO {
  matchId: MatchId;
  opponentUsername: string;
  championId: ChampionId;
  result: MatchResult;
  endReason: EndReason;
  durationMs: number;
  /** ISO-8601 timestamp. */
  endedAt: string;
}

/** Sent server→client via REST, one row of the leaderboard (R8.1, R8.2). */
export interface LeaderboardEntryDTO {
  username: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  winRate: number;
}

/** Sent server→client via REST, one champion's aggregate win rate across all recorded matches (R8.3). */
export interface ChampionWinRateDTO {
  championId: ChampionId;
  gamesPlayed: number;
  winRate: number;
}
