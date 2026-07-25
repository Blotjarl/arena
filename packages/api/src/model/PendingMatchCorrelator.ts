import { MatchId, NotImplementedError } from '@arena/shared';

interface PendingRecord {
  begin?: unknown;
  end?: unknown;
}

/**
 * Reconciles the server's two separate HTTP reports (match begin, match end — SRS 3.2.7.4 step 26) into
 * one record ready for MatchRepository.recordMatch(). CRITICAL CHECKPOINT (prompts/00_master_context.md
 * §8): recordEnd/recordBegin must be idempotent per matchId — a retried report must not double-persist.
 */
export class PendingMatchCorrelator {
  private pending: Map<MatchId, PendingRecord> = new Map();

  /**
   * Records the "match begin" half of a match report. Idempotent per `matchId` — a retried begin report
   * for a matchId already recorded must not create a second pending entry.
   * @param matchId - the match this report belongs to
   * @param participants - the two participants as reported at match start
   */
  recordBegin(matchId: MatchId, participants: unknown): void {
    throw new NotImplementedError('PendingMatchCorrelator.recordBegin not yet implemented');
  }

  /**
   * Records the "match end" half of a match report. Idempotent per `matchId` — a retried end report must
   * not double-persist by returning a second combined record for the same match.
   * @param matchId - the match this report belongs to
   * @param outcome - the match's outcome as reported at match end
   * @returns the combined `{begin, end}` record once both halves are present for this `matchId`,
   *   otherwise `null`
   */
  recordEnd(matchId: MatchId, outcome: unknown): PendingRecord | null {
    throw new NotImplementedError('PendingMatchCorrelator.recordEnd not yet implemented');
  }
}
