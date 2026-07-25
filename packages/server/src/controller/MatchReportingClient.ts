import { MatchId, MatchParticipant, NotImplementedError } from '@arena/shared';

/**
 * Plain HTTP client, not MVC — reports a match's begin/end to packages/api's InternalMatchController
 * (2.3). This is the server's only outbound persistence call; the server never writes to PostgreSQL
 * directly, keeping persistence failures off the hot path of match simulation (3.6.1, R7.4).
 */
export class MatchReportingClient {
  constructor(private readonly apiBaseUrl: string) {}

  /**
   * Reports that a match has begun. Log-and-swallow on failure — network or API errors are logged and
   * never thrown into match simulation, so a reporting outage cannot interrupt or crash the live game
   * server process (R7.4). Callers must not `await` this expecting a rejection to signal failure.
   * @param matchId - the match that began
   * @param participants - both participants' champion/team selections, for the eventual match record
   */
  async reportMatchBegin(matchId: MatchId, participants: MatchParticipant[]): Promise<void> {
    throw new NotImplementedError('MatchReportingClient.reportMatchBegin not yet implemented');
  }

  /**
   * Reports that a match has ended. Log-and-swallow on failure, for the same reason as reportMatchBegin
   * (R7.4) — a lost report only affects match history, never gameplay.
   * @param matchId - the match that ended
   * @param outcome - the end reason, winning team, and duration
   */
  async reportMatchEnd(matchId: MatchId, outcome: unknown): Promise<void> {
    throw new NotImplementedError('MatchReportingClient.reportMatchEnd not yet implemented');
  }
}
