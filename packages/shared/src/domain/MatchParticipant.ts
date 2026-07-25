import { MatchId, PlayerId, ChampionId } from './ids';
import { Team } from './Team';
import { MatchResult } from './MatchResult';

/** One player's row in a completed match's historical record (R7.1, R-DB3), joined with `Match` by id. */
export class MatchParticipant {
  constructor(
    /** Identifier of the match this row belongs to. */
    public readonly matchId: MatchId,
    /** Identifier of the participating player. */
    public readonly playerId: PlayerId,
    /** The side this player fought on. */
    public readonly team: Team,
    /** The champion this player selected. */
    public readonly championId: ChampionId,
    /** This player's outcome. */
    public readonly result: MatchResult,
  ) {}
}
