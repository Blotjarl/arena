import { MatchHistoryEntryDTO, MatchParticipant, NotImplementedError } from '@arena/shared';

/**
 * Formats `MatchParticipant[]` into the wire-shaped, paginated `MatchHistoryEntryDTO[]` for a REST
 * response. A plain formatter, not a `View` implementer — a synchronous HTTP response has no push/observe
 * relationship to establish.
 */
export class MatchHistoryResponseView {
  /**
   * @param participants - the page of match-participant rows to format
   * @returns the DTO array to send as the JSON response body
   */
  render(participants: MatchParticipant[]): MatchHistoryEntryDTO[] {
    throw new NotImplementedError('MatchHistoryResponseView.render not yet implemented');
  }
}
