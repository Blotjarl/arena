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

  recordBegin(matchId: MatchId, participants: unknown): void {
    throw new NotImplementedError('PendingMatchCorrelator.recordBegin not yet implemented');
  }

  /** Returns the combined record once both halves are present, otherwise null. */
  recordEnd(matchId: MatchId, outcome: unknown): PendingRecord | null {
    throw new NotImplementedError('PendingMatchCorrelator.recordEnd not yet implemented');
  }
}
