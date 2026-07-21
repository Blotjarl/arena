import { MatchId, ChampionId } from '../domain/ids';
import { EndReason } from '../domain/EndReason';
import { MatchResult } from '../domain/MatchResult';

export interface MatchHistoryEntryDTO {
  matchId: MatchId;
  opponentUsername: string;
  championId: ChampionId;
  result: MatchResult;
  endReason: EndReason;
  durationMs: number;
  endedAt: string;
}

export interface LeaderboardEntryDTO {
  username: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  winRate: number;
}

export interface ChampionWinRateDTO {
  championId: ChampionId;
  gamesPlayed: number;
  winRate: number;
}
