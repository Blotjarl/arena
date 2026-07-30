/**
 * Shared pixel-art champion sprite renderer (extracted from MatchHUDView in 11_client_8 — see that
 * prompt's Scope A.1). Previously private to the match HUD; now also reused by ChampionSelectView
 * (Scope A.3), so a player sees who they're picking, not just a name/stat block.
 *
 * CORRECTION (11_client_8): grids grew from 11x12/13 cells at 4px/cell (11_client_3's original, deliberately
 * minimal first cut) to 15x18 at 5px/cell, and the legend grew from 4 characters to 7 — 'S'/'H'/'W' add
 * shadow/highlight/weapon-metal detail on top of the original 'O'/'B'/'E'/'A'. 'S' and 'H' are fixed
 * neutral tones (not tied to --champion-accent) so they read as shading regardless of which champion's
 * hue they sit inside; 'B' still resolves through --champion-accent, so per-champion recoloring keeps
 * working without touching the grids themselves — same "sprite's own colors say who, the surrounding
 * marker glow says whose side" split 11_client_3 established.
 */

/**
 * Hand-built pixel grids, one per champion, dark-fantasy silhouettes matching each champion's
 * established identity: Korr (bruiser) wide/bulky/armored with a warhammer glinting at his shoulder;
 * Vex (mage) slender/hooded/robed with a staff at her side; Rin (duelist) lean and angular with twin
 * blades. Chars: '.' transparent, 'O' outline, 'B' body (champion accent), 'E' eye, 'A' secondary
 * accent/blade, 'S' shadow (fixed dark neutral), 'H' highlight (fixed light neutral), 'W' weapon/metal
 * (fixed steel neutral). Rows need not be perfectly uniform width — ChampionSprite only fills cells that
 * exist in a given row.
 */
export const CHAMPION_SPRITES: Record<string, readonly string[]> = {
  korr: [
    '.....OOOOO.....',
    '....OHHHHHO....',
    '...OOBBBBBOO...',
    '..OOBBEOEBBOO..',
    '..OBBBBBBBBBO..',
    '..OBBSBBBSBBO..',
    '.OOBBBBBBBBBOO.',
    'OOBBBBBBBBBBBOW',
    'OBBBBBBBBBBBBOW',
    'OBBBSBBBBBSBBOW',
    'OBBBBBBBBBBBBOO',
    '.OBBBBBBBBBBO..',
    '.OBBB.....BBO..',
    '.OBB.......BBO.',
    '.OB.........BO.',
    '.OB.........BO.',
    '.OO.........OO.',
    '................',
  ],
  vex: [
    '.......O.......',
    '......OOO......',
    '.....OHHHO.....',
    '....OBEOEBO....',
    '....OBBBBBO....',
    '.....OBBBO.....',
    '.....OBBBO.....',
    '....OOBBBOOW...',
    '...OOBBBBBOOW..',
    '...OBBBBBBBOW..',
    '..OBBBBBBBBBO..',
    '..OBBBSBSBBBO..',
    '.OBBBBBBBBBBBO.',
    '.OBB.BBB.BBBO..',
    '.OB...BBB...BO.',
    '.OB.........BO.',
    '.OO.........OO.',
    '................',
  ],
  rin: [
    '......OOO......',
    '.....OBBBBO....',
    '....OBEOEBO....',
    '....OBBBBBO....',
    '.....OBBBO.....',
    '....OBBBBBO....',
    '...AOBBBBBOW...',
    '..AOBBBBBBBOW..',
    '..OBBBBBBBBBO..',
    '..OBBSBBBSBBO..',
    '..OBBBBBBBBBO..',
    '.OBBBBBBBBBBBO.',
    '.OBB.O...O.BBO.',
    '.OB...O.O...BO.',
    '.OB.........BO.',
    '.OB.........BO.',
    '.OO.........OO.',
    '................',
  ],
};

/** Pixel-art cell size, in real px, for each sprite grid unit. */
export const SPRITE_CELL_PX = 5;

export const SPRITE_PIXEL_COLORS: Record<string, string> = {
  O: 'var(--color-border-strong)',
  B: 'var(--champion-accent)',
  E: 'var(--color-text)',
  A: 'var(--color-text-muted)',
  S: '#141726',
  H: '#f2ead8',
  W: '#b8bfd1',
};

/**
 * Renders one champion's inline-SVG pixel sprite. A genuinely blocky look, no image assets.
 * Falls back to Korr's grid for an unrecognized championId (defensive — the fixed three-champion
 * roster should never actually produce one).
 * @param props.championId - which champion's grid to render
 * @param props.animated - whether to apply the idle bob animation (match-HUD markers only; the
 *   champion-select roster stays still so a player can compare cards without motion distraction)
 */
export function ChampionSprite(props: { championId: string; animated?: boolean }): JSX.Element {
  const grid = CHAMPION_SPRITES[props.championId] ?? CHAMPION_SPRITES.korr;
  const cols = Math.max(...grid.map((row) => row.length));
  const rows = grid.length;
  return (
    <svg
      className={`champion-sprite champion-${props.championId} ${
        props.animated ? 'champion-sprite--idle' : ''
      }`}
      width={cols * SPRITE_CELL_PX}
      height={rows * SPRITE_CELL_PX}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {grid.flatMap((row, y) =>
        row.split('').map((cell, x) => {
          const fill = SPRITE_PIXEL_COLORS[cell];
          if (!fill) return null;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />;
        }),
      )}
    </svg>
  );
}
