import { MatchHistoryEntryDTO } from '@arena/shared';
import { MatchHistoryRow } from '../model/MatchRepository';

/**
 * Formats `MatchHistoryRow[]` into the wire-shaped, paginated `MatchHistoryEntryDTO[]` for a REST response.
 * A plain formatter, not a `View` implementer — a synchronous HTTP response has no push/observe
 * relationship to establish.
 *
 * CORRECTION (Step 10): the original stub's signature took `MatchParticipant[]`, but that domain type
 * carries no `opponentUsername` — see `MatchRepository.findHistoryForPlayer`'s Step 10 correction
 * (`10_api_2`), which now returns the enriched `MatchHistoryRow` shape instead. This view's only remaining
 * job is the `Date` → ISO-8601 string conversion `MatchHistoryEntryDTO` requires for the wire.
 */
export class MatchHistoryResponseView {
  /**
   * @param rows - the page of match-history rows to format
   * @returns the DTO array to send as the JSON response body
   */
  render(rows: MatchHistoryRow[]): MatchHistoryEntryDTO[] {
    return rows.map((row) => ({
      matchId: row.matchId,
      opponentUsername: row.opponentUsername,
      championId: row.championId,
      result: row.result,
      endReason: row.endReason,
      durationMs: row.durationMs,
      endedAt: row.endedAt.toISOString(),
    }));
  }
}
