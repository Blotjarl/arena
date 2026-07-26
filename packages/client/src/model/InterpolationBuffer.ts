import { MatchStatePayload, PlayerId, Position } from '@arena/shared';

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
    this.samples.push(snapshot);
    if (this.samples.length > this.capacity) {
      this.samples.shift();
    }
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
    if (this.samples.length === 0) {
      return new Position(0, 0);
    }

    if (this.samples.length === 1) {
      return this.findPosition(this.samples[0], playerId) ?? new Position(0, 0);
    }

    const TICK_INTERVAL_MS = 50; // 20Hz server tick rate
    const lastTick = this.samples[this.samples.length - 1].tick;

    // Anchor the latest tick at (now + TICK_INTERVAL_MS/2) so the render query `now`
    // always falls between two bracketing samples, enabling smooth interpolation.
    // Earlier samples step back 50 ms per tick from that anchor.
    const anchor = now + TICK_INTERVAL_MS / 2;
    const toMs = (s: MatchStatePayload): number =>
      anchor - (lastTick - s.tick) * TICK_INTERVAL_MS;

    // Default to the last two samples; override if we find a tighter bracket.
    let prev = this.samples[this.samples.length - 2];
    let next = this.samples[this.samples.length - 1];

    for (let i = 0; i < this.samples.length - 1; i++) {
      const tA = toMs(this.samples[i]);
      const tB = toMs(this.samples[i + 1]);
      if (tA <= now && now <= tB) {
        prev = this.samples[i];
        next = this.samples[i + 1];
        break;
      }
    }

    const tPrev = toMs(prev);
    const tNext = toMs(next);
    const span = tNext - tPrev;

    const pPrev = this.findPosition(prev, playerId);
    const pNext = this.findPosition(next, playerId);

    if (!pPrev) return pNext ?? new Position(0, 0);
    if (!pNext) return pPrev;
    if (span <= 0) return pNext;

    const t = Math.max(0, Math.min(1, (now - tPrev) / span));
    return new Position(
      pPrev.x + t * (pNext.x - pPrev.x),
      pPrev.y + t * (pNext.y - pPrev.y),
    );
  }

  private findPosition(snapshot: MatchStatePayload, playerId: PlayerId): Position | undefined {
    return snapshot.participants.find((p) => p.playerId === playerId)?.position;
  }
}
