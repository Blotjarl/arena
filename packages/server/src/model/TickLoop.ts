import { MatchId, NotImplementedError } from '@arena/shared';
import { MatchModel } from './MatchModel';

export class TickLoop {
  private matches: Map<MatchId, MatchModel> = new Map();
  private handle: NodeJS.Timeout | null = null;

  constructor(private readonly tickRateHz: number = 20) {}

  register(match: MatchModel): void {
    this.matches.set(match.id, match);
  }

  unregister(matchId: MatchId): void {
    this.matches.delete(matchId);
  }

  start(): void {
    throw new NotImplementedError('TickLoop.start not yet implemented');
  }

  stop(): void {
    throw new NotImplementedError('TickLoop.stop not yet implemented');
  }

  /**
   * CRITICAL CHECKPOINT (prompts/00_master_context.md §8): must wrap each match's tick() in its own
   * try/catch so one match's internal error cannot crash the loop or affect any other match (R5.4, 3.6.2).
   * The stub below intentionally does not yet demonstrate this — Step 3/8 implementation must add it.
   */
  private onTick(): void {
    throw new NotImplementedError('TickLoop.onTick not yet implemented');
  }
}
