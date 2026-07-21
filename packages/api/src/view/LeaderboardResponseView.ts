import { LeaderboardEntryDTO, NotImplementedError } from '@arena/shared';
import { LeaderboardEntry } from '../model/LeaderboardEntry';

export class LeaderboardResponseView {
  render(entries: LeaderboardEntry[]): LeaderboardEntryDTO[] {
    throw new NotImplementedError('LeaderboardResponseView.render not yet implemented');
  }
}
