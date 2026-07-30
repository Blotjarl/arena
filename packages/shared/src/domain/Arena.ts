/**
 * Fixed dimensions of the arena's game-logic coordinate space (not pixels) — shared by the server's
 * movement clamp (`ParticipantState.move()`) and the client's rendering scale. Every champion's
 * `moveSpeed` and every ability's `range` in `ChampionRoster` was balanced against roughly this scale;
 * do not change these values without re-checking that balance still holds.
 *
 * CORRECTION (Step 11, 11_server_3): `ARENA_WIDTH` widened from 400 to 600 (1.5x) — a wider, not bigger-
 * square, arena per the prompt's request. `ARENA_HEIGHT` is unchanged. See `docs/01_class_list.md` §2 for
 * the re-verified balance implications (Vex's Arcane Bolt range vs. the new diagonal, sprint-across time).
 *
 * CORRECTION (Step 11, 11_cross_1): both dimensions widened a further 20% (600x400 -> 720x480),
 * preserving the same 1.5:1 ratio everything above is already tuned to. See `docs/01_class_list.md` §2
 * for the re-verified balance implications at the new size.
 */
export const ARENA_WIDTH = 720;
export const ARENA_HEIGHT = 480;

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
 * As of Step 11 (`11_cross_1`), obstacles also block ability line-of-sight (see `segmentCrossesObstacle`
 * below) — the original "movement only" scope decision from `11_server_3` was explicitly a placeholder
 * for that later prompt, not a permanent design choice.
 *
 * CORRECTION (Step 11, 11_cross_1): rescaled by the same 1.2x factor as `ARENA_WIDTH`/`ARENA_HEIGHT`,
 * keeping the layout proportionally identical — still in the arena's middle third, still mirrored
 * left-right around the new horizontal center (`x = 360`), still well clear of both (now-wider) spawn
 * points (`(50, 240)` and `(670, 240)`) and of the side walls. The two flanking pillars remain exact
 * mirror images of each other, and the top-center block remains self-mirrored. None spans the arena's
 * full width or height, and a proportionally-scaled ~108px gap is kept clean around dead-center so a
 * clear path still exists straight between the pillars as well as around them.
 */
export const ARENA_OBSTACLES: readonly ArenaObstacle[] = [
  { x: 246, y: 156, width: 60, height: 120 }, // left-center pillar
  { x: 414, y: 156, width: 60, height: 120 }, // right-center pillar (mirror of the one above)
  { x: 330, y: 24, width: 60, height: 60 }, // top-center block (self-mirrored)
];

/**
 * Aim-forgiveness radius (arena units) for skillshot hit resolution (Step 11, 11_cross_1) —
 * `MatchModel.submitAbility` counts a `DAMAGE`/`CROWD_CONTROL` skillshot as "aimed at" the opponent when
 * their perpendicular distance from the cast ray is within this radius. A tunable balance number, not a
 * literal character hitbox size — adjust based on how it actually feels to play, not from first
 * principles.
 */
export const SKILLSHOT_HIT_RADIUS = 40;

/**
 * @returns true if the given point falls within (or on the boundary of) any `ARENA_OBSTACLE` rectangle.
 * @param x - horizontal coordinate to test
 * @param y - vertical coordinate to test
 */
export function isWithinObstacle(x: number, y: number): boolean {
  return ARENA_OBSTACLES.some((o) => x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height);
}

/**
 * Segment-vs-axis-aligned-rectangle intersection test, via Liang–Barsky parametric clipping: computes the
 * range of the segment's parameter `t` (0 at `(x1,y1)`, 1 at `(x2,y2)`) that lies within the rectangle's
 * four bounding half-planes, narrowing `[t0, t1]` on each one; the segment intersects the rectangle iff a
 * non-empty `[t0, t1]` range survives all four. This correctly handles every case a naive
 * "do either endpoint fall inside, or does the segment cross an edge" check would miss or get subtly
 * wrong at the boundaries: a segment that clips only a corner, a segment fully contained inside the
 * rectangle (both endpoints inside — never crosses an edge, but still intersects), and touching-the-
 * boundary-exactly cases (kept inclusive, matching `isWithinObstacle`'s own `<=` convention).
 * @param x1 - x of one endpoint of the segment (arena units)
 * @param y1 - y of that same endpoint
 * @param x2 - x of the other endpoint
 * @param y2 - y of that other endpoint
 * @param rect - the rectangle to test against
 * @returns true if the segment intersects `rect` at all (including full containment)
 */
function segmentCrossesRect(x1: number, y1: number, x2: number, y2: number, rect: ArenaObstacle): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, x1 - rect.x],
    [dx, rect.x + rect.width - x1],
    [-dy, y1 - rect.y],
    [dy, rect.y + rect.height - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false; // segment parallel to this edge and entirely outside it
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

/**
 * @returns true if the straight segment from `(x1,y1)` to `(x2,y2)` crosses any `ARENA_OBSTACLES`
 * rectangle (Step 11, 11_cross_1) — used to block ability line-of-sight the same way `isWithinObstacle`
 * already blocks movement.
 */
export function segmentCrossesObstacle(x1: number, y1: number, x2: number, y2: number): boolean {
  return ARENA_OBSTACLES.some((o) => segmentCrossesRect(x1, y1, x2, y2, o));
}
