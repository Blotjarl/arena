import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ARENA_OBSTACLES,
  SKILLSHOT_HIT_RADIUS,
  isWithinObstacle,
  segmentCrossesObstacle,
  distanceFromSegment,
} from './Arena';

describe('Arena', () => {
  it('ARENA_WIDTH is 1.5x ARENA_HEIGHT, widened 20% per Step 11 (11_cross_1)', () => {
    expect(ARENA_WIDTH).toBe(720);
    expect(ARENA_HEIGHT).toBe(480);
  });

  it('defines at least two obstacles, none spanning the full width or height', () => {
    expect(ARENA_OBSTACLES.length).toBeGreaterThanOrEqual(2);
    for (const o of ARENA_OBSTACLES) {
      expect(o.width).toBeLessThan(ARENA_WIDTH);
      expect(o.height).toBeLessThan(ARENA_HEIGHT);
    }
  });

  it('CORRECTION (11_cross_1): obstacles stay mirrored around the new horizontal center and clear of both spawns', () => {
    const center = ARENA_WIDTH / 2; // 360
    const [leftPillar, rightPillar, topBlock] = ARENA_OBSTACLES;
    // left/right pillars are exact mirror images around the new center
    expect(leftPillar.width).toBe(rightPillar.width);
    expect(leftPillar.height).toBe(rightPillar.height);
    expect(leftPillar.y).toBe(rightPillar.y);
    expect(center - (leftPillar.x + leftPillar.width)).toBeCloseTo(rightPillar.x - center, 5);
    // top block is self-mirrored (centered exactly on the new center)
    expect(topBlock.x + topBlock.width / 2).toBeCloseTo(center, 5);
    // spawns (SPAWN_WALL_MARGIN=50 from either edge, per MatchModel) stay well clear of every obstacle
    const spawnA = { x: 50, y: ARENA_HEIGHT / 2 };
    const spawnB = { x: ARENA_WIDTH - 50, y: ARENA_HEIGHT / 2 };
    expect(isWithinObstacle(spawnA.x, spawnA.y)).toBe(false);
    expect(isWithinObstacle(spawnB.x, spawnB.y)).toBe(false);
  });

  it('SKILLSHOT_HIT_RADIUS is a positive tunable aim-forgiveness radius', () => {
    expect(SKILLSHOT_HIT_RADIUS).toBeGreaterThan(0);
  });

  describe('isWithinObstacle', () => {
    it('true for a point inside an obstacle, including its boundary edges', () => {
      const o = ARENA_OBSTACLES[0];
      expect(isWithinObstacle(o.x, o.y)).toBe(true); // top-left corner
      expect(isWithinObstacle(o.x + o.width, o.y + o.height)).toBe(true); // bottom-right corner
      expect(isWithinObstacle(o.x + o.width / 2, o.y + o.height / 2)).toBe(true); // center
    });

    it('false for a point just outside an obstacle on every side', () => {
      const o = ARENA_OBSTACLES[0];
      expect(isWithinObstacle(o.x - 1, o.y + o.height / 2)).toBe(false);
      expect(isWithinObstacle(o.x + o.width + 1, o.y + o.height / 2)).toBe(false);
      expect(isWithinObstacle(o.x + o.width / 2, o.y - 1)).toBe(false);
      expect(isWithinObstacle(o.x + o.width / 2, o.y + o.height + 1)).toBe(false);
    });

    it('false for a point far from every obstacle', () => {
      expect(isWithinObstacle(0, 0)).toBe(false);
      expect(isWithinObstacle(ARENA_WIDTH, ARENA_HEIGHT)).toBe(false);
    });

    it('true across more than one obstacle, not just the first', () => {
      for (const o of ARENA_OBSTACLES) {
        expect(isWithinObstacle(o.x + o.width / 2, o.y + o.height / 2)).toBe(true);
      }
    });
  });

  describe('segmentCrossesObstacle (11_cross_1 — obstacles now block ability line-of-sight, not just movement)', () => {
    const o = ARENA_OBSTACLES[0]; // left-center pillar
    const midY = o.y + o.height / 2;

    it('true for a segment that passes fully through an obstacle (neither endpoint inside)', () => {
      expect(segmentCrossesObstacle(o.x - 50, midY, o.x + o.width + 50, midY)).toBe(true);
    });

    it('true for a segment with one endpoint inside an obstacle', () => {
      expect(segmentCrossesObstacle(o.x + o.width / 2, midY, o.x - 100, midY)).toBe(true);
    });

    it('true for a segment fully contained inside an obstacle (both endpoints inside)', () => {
      expect(
        segmentCrossesObstacle(o.x + 5, o.y + 5, o.x + o.width - 5, o.y + o.height - 5),
      ).toBe(true);
    });

    it('true for a segment that clips just a corner of an obstacle', () => {
      // diagonal segment grazing the top-left corner
      expect(
        segmentCrossesObstacle(o.x - 10, o.y - 10, o.x + 10, o.y + 10),
      ).toBe(true);
    });

    it('false for a segment that passes nearby but does not intersect (no false positives)', () => {
      // well above the obstacle's y-range, same x-span
      expect(segmentCrossesObstacle(o.x - 50, o.y - 50, o.x + o.width + 50, o.y - 20)).toBe(false);
    });

    it('false for a segment far from every obstacle entirely', () => {
      expect(segmentCrossesObstacle(0, 0, 5, 5)).toBe(false);
    });

    it('true across more than one obstacle, not just the first', () => {
      for (const obstacle of ARENA_OBSTACLES) {
        const cy = obstacle.y + obstacle.height / 2;
        expect(
          segmentCrossesObstacle(obstacle.x - 50, cy, obstacle.x + obstacle.width + 50, cy),
        ).toBe(true);
      }
    });

    it('a degenerate zero-length segment (both points equal) does not throw and is decided by isWithinObstacle', () => {
      expect(() => segmentCrossesObstacle(o.x + 5, o.y + 5, o.x + 5, o.y + 5)).not.toThrow();
      expect(segmentCrossesObstacle(o.x + 5, o.y + 5, o.x + 5, o.y + 5)).toBe(true);
      expect(segmentCrossesObstacle(0, 0, 0, 0)).toBe(false);
    });
  });

  describe('distanceFromSegment (11_cross_2 — first used by Bulwark Charge\'s collision stagger check)', () => {
    it('zero for a point exactly on the segment', () => {
      expect(distanceFromSegment(0, 0, 100, 0, 50, 0)).toBeCloseTo(0, 5);
    });

    it('the perpendicular distance for a point whose closest approach falls within the segment', () => {
      expect(distanceFromSegment(0, 0, 100, 0, 50, 30)).toBeCloseTo(30, 5);
    });

    it('clamps to the nearer endpoint when the point\'s projection falls beyond the segment, rather than extrapolating past it', () => {
      // Closest point on the infinite line through (0,0)-(100,0) to (150,40) would be (150,0), off the
      // segment entirely -- the real closest point is the endpoint (100,0).
      expect(distanceFromSegment(0, 0, 100, 0, 150, 40)).toBeCloseTo(Math.hypot(50, 40), 5);
      expect(distanceFromSegment(0, 0, 100, 0, -30, 40)).toBeCloseTo(Math.hypot(30, 40), 5);
    });

    it('a degenerate zero-length segment (both points equal) does not throw and is decided by direct point distance', () => {
      expect(() => distanceFromSegment(10, 10, 10, 10, 13, 14)).not.toThrow();
      expect(distanceFromSegment(10, 10, 10, 10, 13, 14)).toBeCloseTo(5, 5); // 3-4-5 triangle
    });

    it('works for a diagonal segment, not just axis-aligned ones', () => {
      // Segment (0,0)-(10,10); point (10,0) -- closest point on the segment is its exact midpoint (5,5).
      expect(distanceFromSegment(0, 0, 10, 10, 10, 0)).toBeCloseTo(Math.hypot(5, 5), 5);
    });
  });
});
