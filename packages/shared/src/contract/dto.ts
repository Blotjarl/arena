import { MatchId, PlayerId, ChampionId } from '../domain/ids';
import { EndReason } from '../domain/EndReason';
import { MatchResult } from '../domain/MatchResult';
import { Team } from '../domain/Team';

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

/**
 * `MatchReportingClient.reportMatchBegin`'s request body — internal server→api HTTP only, POST
 * `/internal/matches/begin` (R7.1, R7.4). `docs/01_class_list.md` §5b originally sketched this method's
 * `participants` parameter as `MatchParticipant[]`, but `MatchParticipant` requires a `result: MatchResult`
 * that genuinely doesn't exist yet at match-begin time (the match hasn't ended). This shape mirrors
 * `packages/api/src/model/PendingMatchCorrelator`'s `BeginParticipant` field-for-field.
 *
 * CORRECTION (`10_api_1`, applied here per that prompt's design note 5 ahead of `10_server_6`'s own commit):
 * includes `username` alongside the transient, client-generated `playerId`. `InternalMatchController.
 * handleEnd` (`10_api_1`) must resolve each participant's canonical `players.id` via `PlayerRepository.
 * findOrCreateByUsername(username)` before persisting — `match_participants.player_id` has a foreign key to
 * `players(id)`, and `playerId` here is never a row `PlayerRepository` has created. Without `username`,
 * every `recordMatch` call would fail its foreign-key constraint.
 */
export interface MatchBeginReportDTO {
  matchId: MatchId;
  participants: { playerId: PlayerId; username: string; team: Team; championId: ChampionId }[];
}

/**
 * `MatchReportingClient.reportMatchEnd`'s request body — internal server→api HTTP only, POST
 * `/internal/matches/end`. Mirrors `PendingMatchCorrelator`'s `MatchOutcome` field-for-field, with
 * `endedAt` as an ISO-8601 string over the wire (same convention as `MatchHistoryEntryDTO.endedAt`) — the
 * receiving side reconstructs it with `new Date(...)`.
 */
export interface MatchEndReportDTO {
  matchId: MatchId;
  endReason: EndReason;
  winningTeam: Team | null;
  durationMs: number;
  /** ISO-8601 timestamp. */
  endedAt: string;
}
