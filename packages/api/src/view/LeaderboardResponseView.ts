import { LeaderboardEntryDTO, NotImplementedError } from '@arena/shared';
import { LeaderboardEntry } from '../model/LeaderboardEntry';

/**
 * Formats `LeaderboardEntry[]` into the wire-shaped `LeaderboardEntryDTO[]` for a REST response. A plain
 * formatter, not a `View` implementer — a synchronous HTTP response has no push/observe relationship to
 * establish.
 */
export class LeaderboardResponseView {
  /**
   * @param entries - the computed leaderboard rows to format
   * @returns the DTO array to send as the JSON response body
   */
  render(entries: LeaderboardEntry[]): LeaderboardEntryDTO[] {
    throw new NotImplementedError('LeaderboardResponseView.render not yet implemented');
  }
}
