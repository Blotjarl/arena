/** A 2D point in arena-space. Used for champion positions and ability targeting. */
export class Position {
  constructor(
    /** Horizontal coordinate. */
    public readonly x: number,
    /** Vertical coordinate. */
    public readonly y: number,
  ) {}

  /**
   * Euclidean distance between this position and another.
   * @param other - the position to measure to
   * @returns the straight-line distance, in the same units as x and y
   */
  distanceTo(other: Position): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }
}
