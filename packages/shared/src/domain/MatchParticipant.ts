import { MatchId, PlayerId, ChampionId } from './ids';
import { Team } from './Team';
import { MatchResult } from './MatchResult';

export class MatchParticipant {
  constructor(
    public readonly matchId: MatchId,
    public readonly playerId: PlayerId,
    public readonly team: Team,
    public readonly championId: ChampionId,
    public readonly result: MatchResult,
  ) {}
}
