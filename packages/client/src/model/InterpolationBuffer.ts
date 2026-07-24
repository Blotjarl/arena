import { MatchStatePayload, PlayerId, Position, NotImplementedError } from '@arena/shared';

/**
 * Buffers recent authoritative MatchStatePayload snapshots and produces smoothly-interpolated
 * positions for rendering between the server's 20Hz ticks (R4.7, R-P4).
 * This is a rendering aid only — nothing it produces is written back into ClientMatchModel or
 * treated as authoritative. The server remains the sole source of truth for all positions.
 */
export class InterpolationBuffer {
  /** Circular store of retained snapshots, oldest evicted once capacity is exceeded. */
  private samples: MatchStatePayload[] = [];

  /**
   * @param capacity - maximum number of snapshots retained; oldest is dropped once exceeded
   */
  constructor(private readonly capacity: number) {}

  /**
   * Records a newly-received authoritative snapshot.
   * @param snapshot - the match state as broadcast by the server
   */
  push(snapshot: MatchStatePayload): void {
    throw new NotImplementedError('InterpolationBuffer.push not yet implemented');
  }

  /**
   * Computes a smoothed, render-only position for a participant at the given time, interpolating
   * between the two bracketing snapshots. Never mutates any stored model state.
   * CRITICAL: the returned Position is for display only — never write it back into ClientMatchModel
   * or any authoritative field (prompts/00_master_context.md §8, R4.7 / R-P4).
   * @param playerId - which participant to interpolate
   * @param now - the current render timestamp in milliseconds
   * @returns an interpolated Position for display
   */
  getInterpolatedPosition(playerId: PlayerId, now: number): Position {
    throw new NotImplementedError('InterpolationBuffer.getInterpolatedPosition not yet implemented');
  }
}
