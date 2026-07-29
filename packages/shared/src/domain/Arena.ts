/**
 * Fixed dimensions of the arena's game-logic coordinate space (not pixels) — shared by the server's
 * movement clamp (`ParticipantState.move()`) and the client's rendering scale. Every champion's
 * `moveSpeed` and every ability's `range` in `ChampionRoster` was balanced against roughly this scale;
 * do not change these values without re-checking that balance still holds.
 *
 * CORRECTION (Step 11, 11_server_3): `ARENA_WIDTH` widened from 400 to 600 (1.5x) — a wider, not bigger-
 * square, arena per the prompt's request. `ARENA_HEIGHT` is unchanged. See `docs/01_class_list.md` §2 for
 * the re-verified balance implications (Vex's Arcane Bolt range vs. the new diagonal, sprint-across time).
 */
export const ARENA_WIDTH = 600;
export const ARENA_HEIGHT = 400;

/** A single static, rectangular, movement-blocking obstacle in arena-space (Step 11, 11_server_3). */
export interface ArenaObstacle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Fixed, server-authoritative obstacle layout (Step 11, 11_server_3) — enforced by
 * `ParticipantState.move()`, which rejects any movement that would land inside one of these rectangles.
 * Obstacles block movement only, not ability range/targeting or line of sight (a deliberate scope decision
 * — see the prompt for this class list correction).
 *
 * All three sit in the arena's middle third (x in [200, 400]), well clear of both spawn points
 * (`(50, 200)` and `(550, 200)`) and of the side walls, and are mirrored left-right around the arena's
 * horizontal center (`x = 300`) so neither spawn has a positional advantage: the two flanking pillars are
 * exact mirror images of each other, and the top-center block is self-mirrored. None spans the arena's
 * full width or height, and a 90px gap is kept clean around dead-center (`x = 300`, the midpoint between
 * both spawns' y-level) so a clear path always exists straight between the pillars as well as around them.
 */
export const ARENA_OBSTACLES: readonly ArenaObstacle[] = [
  { x: 205, y: 130, width: 50, height: 100 }, // left-center pillar
  { x: 345, y: 130, width: 50, height: 100 }, // right-center pillar (mirror of the one above)
  { x: 275, y: 20, width: 50, height: 50 }, // top-center block (self-mirrored)
];

/**
 * @returns true if the given point falls within (or on the boundary of) any `ARENA_OBSTACLE` rectangle.
 * @param x - horizontal coordinate to test
 * @param y - vertical coordinate to test
 */
export function isWithinObstacle(x: number, y: number): boolean {
  return ARENA_OBSTACLES.some((o) => x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height);
}
