import { MatchId } from './ids';
import { EndReason } from './EndReason';
import { Team } from './Team';

export class Match {
  constructor(
    public readonly id: MatchId,
    public readonly endReason: EndReason,
    public readonly winningTeam: Team | null,
    public readonly durationMs: number,
    public readonly endedAt: Date,
  ) {}
}
