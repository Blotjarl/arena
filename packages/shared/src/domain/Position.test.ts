import { Position } from './Position';

describe('Position', () => {
  describe('distanceTo', () => {
    it('is zero for the same point', () => {
      const p = new Position(5, 5);
      expect(p.distanceTo(new Position(5, 5))).toBe(0);
    });

    it('computes straight-line distance on a horizontal offset', () => {
      const a = new Position(0, 0);
      const b = new Position(3, 0);
      expect(a.distanceTo(b)).toBe(3);
    });

    it('computes straight-line distance on a 3-4-5 triangle', () => {
      const a = new Position(0, 0);
      const b = new Position(3, 4);
      expect(a.distanceTo(b)).toBe(5);
    });

    it('is symmetric', () => {
      const a = new Position(1, 2);
      const b = new Position(7, 11);
      expect(a.distanceTo(b)).toBeCloseTo(b.distanceTo(a), 10);
    });

    it('handles negative coordinates', () => {
      const a = new Position(-2, -3);
      const b = new Position(1, 1);
      expect(a.distanceTo(b)).toBeCloseTo(5, 10);
    });
  });
});
