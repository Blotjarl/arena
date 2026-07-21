import { MatchStatePayload, PlayerId, Position, NotImplementedError } from '@arena/shared';

export class InterpolationBuffer {
  private samples: MatchStatePayload[] = [];

  constructor(private readonly capacity: number) {}

  push(snapshot: MatchStatePayload): void {
    throw new NotImplementedError('InterpolationBuffer.push not yet implemented');
  }

  /**
   * CRITICAL CHECKPOINT (prompts/00_master_context.md §8): must produce a Position for rendering only —
   * never write back into ClientMatchModel or any authoritative field. R4.7 / R-P4.
   */
  getInterpolatedPosition(playerId: PlayerId, now: number): Position {
    throw new NotImplementedError('InterpolationBuffer.getInterpolatedPosition not yet implemented');
  }
}
