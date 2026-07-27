import { MatchId, PlayerId, ChampionId, Team, EndReason } from '@arena/shared';

/** One participant's begin-time selections, as reported by `MatchReportingClient.reportMatchBegin`. */
export interface BeginParticipant {
  playerId: PlayerId;
  team: Team;
  championId: ChampionId;
}

/** A match's end-time outcome, as reported by `MatchReportingClient.reportMatchEnd`. */
export interface MatchOutcome {
  endReason: EndReason;
  winningTeam: Team | null;
  durationMs: number;
  endedAt: Date;
}

/** The combined record `InternalMatchController` hands to `MatchRepository.recordMatch` once both report halves have arrived. */
export interface CorrelatedMatchReport {
  participants: BeginParticipant[];
  outcome: MatchOutcome;
}

interface PendingRecord {
  begin?: BeginParticipant[];
  end?: MatchOutcome;
}

/**
 * Reconciles the server's two separate HTTP reports (match begin, match end — SRS 3.2.7.4 step 26) into
 * one record ready for MatchRepository.recordMatch(). CRITICAL CHECKPOINT (prompts/00_master_context.md
 * §8): recordEnd/recordBegin must be idempotent per matchId — a retried report must not double-persist.
 */
export class PendingMatchCorrelator {
  private pending: Map<MatchId, PendingRecord> = new Map();
  /** matchIds already handed off to the caller via recordEnd — guards against a retried report reviving a completed match. */
  private completed: Set<MatchId> = new Set();

  /**
   * Records the "match begin" half of a match report. Idempotent per `matchId` — a retried begin report
   * for a matchId already recorded must not create a second pending entry.
   * @param matchId - the match this report belongs to
   * @param participants - the two participants as reported at match start
   */
  recordBegin(matchId: MatchId, participants: BeginParticipant[]): void {
    if (this.completed.has(matchId)) return;
    const existing = this.pending.get(matchId);
    if (existing?.begin) return;
    this.pending.set(matchId, { ...existing, begin: participants });
  }

  /**
   * Records the "match end" half of a match report. Idempotent per `matchId` — a retried end report must
   * not double-persist by returning a second combined record for the same match.
   * @param matchId - the match this report belongs to
   * @param outcome - the match's outcome as reported at match end
   * @returns the combined `{participants, outcome}` record once both halves are present for this
   *   `matchId`, otherwise `null`
   */
  recordEnd(matchId: MatchId, outcome: MatchOutcome): CorrelatedMatchReport | null {
    if (this.completed.has(matchId)) return null;
    const existing = this.pending.get(matchId) ?? {};
    if (existing.end) return null;
    const updated: PendingRecord = { ...existing, end: outcome };
    if (!updated.begin) {
      this.pending.set(matchId, updated);
      return null;
    }
    this.pending.delete(matchId);
    this.completed.add(matchId);
    return { participants: updated.begin, outcome };
  }
}
