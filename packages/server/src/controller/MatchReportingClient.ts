import { MatchId, MatchBeginReportDTO, MatchEndReportDTO } from '@arena/shared';

/**
 * Plain HTTP client, not MVC — reports a match's begin/end to packages/api's InternalMatchController
 * (2.3). This is the server's only outbound persistence call; the server never writes to PostgreSQL
 * directly, keeping persistence failures off the hot path of match simulation (3.6.1, R7.4).
 *
 * CORRECTION (Step 10): `docs/01_class_list.md` §5b's original `reportMatchBegin(matchId, participants:
 * MatchParticipant[])` signature is replaced by `MatchBeginReportDTO`/`MatchEndReportDTO` (see
 * `packages/shared/src/contract/dto.ts`) — `MatchParticipant` requires a `result` that doesn't exist yet
 * at match-begin time. See that file's doc comments for the full correction rationale, including the
 * `username` field required by `10_api_1`'s canonical-player-id resolution.
 */
export class MatchReportingClient {
  constructor(private readonly apiBaseUrl: string) {}

  private async post(path: string, body: unknown): Promise<void> {
    try {
      const res = await fetch(`${this.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error(`MatchReportingClient: ${path} responded with status ${res.status}`);
      }
    } catch (err) {
      // Log-and-swallow: a reporting outage must never interrupt or crash the live game server process
      // (R7.4). Callers must not `await` this expecting a rejection to signal failure.
      console.error(`MatchReportingClient: ${path} failed`, err);
    }
  }

  /**
   * Reports that a match has begun. Log-and-swallow on failure — network or API errors are logged and
   * never thrown into match simulation, so a reporting outage cannot interrupt or crash the live game
   * server process (R7.4).
   * @param matchId - the match that began
   * @param participants - both participants' team/champion selections, for the eventual match record
   */
  async reportMatchBegin(matchId: MatchId, participants: MatchBeginReportDTO['participants']): Promise<void> {
    await this.post('/internal/matches/begin', { matchId, participants } satisfies MatchBeginReportDTO);
  }

  /**
   * Reports that a match has ended. Log-and-swallow on failure, for the same reason as reportMatchBegin
   * (R7.4) — a lost report only affects match history, never gameplay.
   * @param matchId - the match that ended
   * @param outcome - the end reason, winning team, duration, and end timestamp
   */
  async reportMatchEnd(matchId: MatchId, outcome: Omit<MatchEndReportDTO, 'matchId'>): Promise<void> {
    await this.post('/internal/matches/end', { matchId, ...outcome } satisfies MatchEndReportDTO);
  }
}
