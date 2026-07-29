/**
 * Fixed dimensions of the arena's game-logic coordinate space (not pixels) — shared by the server's
 * movement clamp (`ParticipantState.move()`) and the client's rendering scale. Every champion's
 * `moveSpeed` and every ability's `range` in `ChampionRoster` was balanced against roughly this scale;
 * do not change these values without re-checking that balance still holds.
 */
export const ARENA_WIDTH = 400;
export const ARENA_HEIGHT = 400;
