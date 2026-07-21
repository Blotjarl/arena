import { MatchHistoryEntryDTO, MatchParticipant, NotImplementedError } from '@arena/shared';

export class MatchHistoryResponseView {
  render(participants: MatchParticipant[]): MatchHistoryEntryDTO[] {
    throw new NotImplementedError('MatchHistoryResponseView.render not yet implemented');
  }
}
