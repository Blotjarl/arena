import { ARENA_WIDTH, ARENA_HEIGHT, ARENA_OBSTACLES, isWithinObstacle } from './Arena';

describe('Arena', () => {
  it('ARENA_WIDTH is 1.5x ARENA_HEIGHT, widened per Step 11 (11_server_3)', () => {
    expect(ARENA_WIDTH).toBe(600);
    expect(ARENA_HEIGHT).toBe(400);
  });

  it('defines at least two obstacles, none spanning the full width or height', () => {
    expect(ARENA_OBSTACLES.length).toBeGreaterThanOrEqual(2);
    for (const o of ARENA_OBSTACLES) {
      expect(o.width).toBeLessThan(ARENA_WIDTH);
      expect(o.height).toBeLessThan(ARENA_HEIGHT);
    }
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
});
