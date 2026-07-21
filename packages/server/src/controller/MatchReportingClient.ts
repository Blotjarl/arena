import { MatchId, MatchParticipant, NotImplementedError } from '@arena/shared';

/** Reports match begin/end to packages/api over HTTP. Log-and-swallow on failure — never throws into match simulation (R7.4). */
export class MatchReportingClient {
  constructor(private readonly apiBaseUrl: string) {}

  async reportMatchBegin(matchId: MatchId, participants: MatchParticipant[]): Promise<void> {
    throw new NotImplementedError('MatchReportingClient.reportMatchBegin not yet implemented');
  }

  async reportMatchEnd(matchId: MatchId, outcome: unknown): Promise<void> {
    throw new NotImplementedError('MatchReportingClient.reportMatchEnd not yet implemented');
  }
}
