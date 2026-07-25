import { MatchId } from './ids';
import { EndReason } from './EndReason';
import { Team } from './Team';

/** Historical record of one completed match, as persisted by `packages/api` (R7.1, R-DB2). */
export class Match {
  constructor(
    /** Identifier of the match this record describes. */
    public readonly id: MatchId,
    /** Why the match ended. */
    public readonly endReason: EndReason,
    /** The winning side, or `null` for a draw/no-contest. */
    public readonly winningTeam: Team | null,
    /** Total match length, in milliseconds. */
    public readonly durationMs: number,
    /** When the match ended. */
    public readonly endedAt: Date,
  ) {}
}
