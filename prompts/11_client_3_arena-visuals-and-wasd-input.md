# Prompt 11_client_3 — Bigger centered arena, unique pixel-art characters, WASD movement

**Owner: Raj.** Load `prompts/00_master_context.md` first.

### CRITICAL prerequisite
**`11_server_2_arena-boundaries.md` must be merged to `main` first.** This prompt needs the real, exported
`ARENA_WIDTH`/`ARENA_HEIGHT` constants from `packages/shared` to scale the arena's rendering correctly —
don't guess or hardcode a coordinate range here. Check `git log` on `main` before starting.

### CRITICAL: what's actually wrong, from manually playing a real match
The Match HUD's arena renders at a fixed 400×400px, left-aligned rather than centered on the page, and
both players start stacked in the same corner (the spawn-position half of this is `11_server_2`'s fix —
once that's merged, positions will already be distinct; this prompt's job is making the *rendering* worth
looking at). The player markers are plain 22px colored circles — functional, but not what "dark fantasy
pixelated art style, unique per character" calls for.

### CRITICAL: the same hard constraint as `11_client_2` — do not break the e2e contract
Every `aria-label` and button/heading string listed in `11_client_2_visual-design-pass.md` still applies
here — restyle and re-render freely, but `you-marker`/`opponent-marker`'s `aria-label`s, `arena`'s
`aria-label`, and every existing button (`Move Up`/`Move Down`/`Move Left`/`Move Right`, the ability
buttons) must keep working exactly as `e2e/match.spec.ts` already exercises them. **WASD is an addition,
not a replacement** — the existing movement buttons must still exist and still work; the e2e suite clicks
them directly and must keep passing unmodified.

---

### Scope

**1. Bigger, centered arena.** Increase the arena's rendered pixel size substantially (roughly 600–800px
is reasonable, but use your judgment for what actually looks good) and center it in the available screen
space, not left-aligned. **Decouple the rendered size from the game's real coordinate space**: `Position`
values coming from the server are still in `ARENA_WIDTH`/`ARENA_HEIGHT` units (`11_server_2`'s constants,
e.g. 400×400) — don't change server-side movement math or ability ranges. Instead, scale when rendering:
`pixelX = (position.x / ARENA_WIDTH) * renderedArenaSizePx` (same idea for `y`). This is the correct fix —
the arena visually growing should not change how far a step actually moves a champion in-game.

**2. Unique, simple, pixelated character sprites, dark fantasy style.** Replace the plain circle markers
with a small hand-built pixel-art sprite per champion — this project has no image-generation tooling and
no reason to add binary image assets to the repo, so build these as inline SVG (a small grid of `<rect>`
elements, `shape-rendering="crispEdges"` for a genuine blocky pixel look) or an equivalent CSS-only
technique (a `box-shadow`-per-pixel grid works too) — your call on exact technique, but it must not require
a new external asset file or a new heavy dependency. Keep each sprite simple (a small grid, e.g. roughly
8–16 pixels per side is plenty — this needs to read clearly at a glance during fast combat, not be
detailed pixel art). Give each of the three champions a distinct, recognizable silhouette matching their
already-established identity and accent color (`--color-korr` #d17a3f / bruiser, bulkier silhouette;
`--color-vex` #9b6bd6 / ranged mage, slender and robed; `--color-rin` #4fae8c / duelist, lean and
angular) — reuse those exact CSS custom properties, don't invent new colors for this. Keep the existing
"you" vs. "opponent" distinction too (the current blue/red glow) — layer it as a ring/glow behind or around
the new sprite, not by recoloring the sprite itself (the sprite's own colors should say *which champion*;
the surrounding treatment should say *whose side*).

**3. WASD keyboard movement, alongside the existing buttons.** Add a `keydown`/`keyup` listener (scoped to
`MatchHUDScreen`'s lifetime via `useEffect`, cleaned up on unmount — this project has hit "worker process
failed to exit gracefully" warnings before from un-cleaned-up timers/listeners; don't add another one) that
maps W/A/S/D to the same four directions the existing buttons already dispatch, and calls the exact same
`controller.operation('move', direction)` those buttons call — don't duplicate or reimplement the dispatch
logic. Implement **hold-to-move**: track currently-held keys, and while a movement key is held, re-dispatch
at a fixed interval (no need to exceed the server's 20Hz tick rate — the server only consumes the latest
buffered move once per tick anyway, so faster than that just wastes socket traffic). Stop dispatching on
`keyup`. Diagonal movement (two keys held at once) is a reasonable nice-to-have if it falls out naturally
from your approach, but not required.

### Process
1. Read `MatchHUDView.tsx`/`MatchHUDScreen`, `styles.css`, and `11_server_2`'s merged changes (the real
   exported constants) in full before writing anything.
2. Build the scaled-rendering fix first (smallest, easiest to verify against the existing e2e test), then
   the sprites, then WASD input.
3. After each piece, run the client's existing Jest suite for `MatchHUDView`/`MatchHUDScreen` — catch a
   broken selector immediately.
4. Once all three are done: full client Jest suite, then the full Playwright e2e suite (`npm run
   test:e2e`), twice in a row from a cold `docker compose -f docker-compose.test.yml down -v` — same
   standard every e2e-touching prompt in this project has held to.
5. Load the app in a real browser yourself and actually play a match (two tabs, per the project's own
   documented manual-testing steps) — confirm the arena looks right, the sprites are distinct and
   recognizable, WASD actually moves your champion and stops at the walls, and the existing click buttons
   still work too. Describe what you see in your PR description.

---

### Verification and Git
Report the real output of the full client Jest suite and the full Playwright e2e suite (both full runs).
Branch `client` from `main` (check `git log` for divergence first — pull before you start, not after),
commit `Step 11: bigger centered arena, pixel-art character sprites, WASD movement`, push, open a PR into
`main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: manually verify a champion actually stops at the arena wall through the real UI (hold a
movement key/click a direction button repeatedly toward an edge) — `11_server_2`'s server-side clamp is
only half the proof; confirm the client's scaled rendering doesn't itself let a marker visually drift
outside the arena's rendered bounds due to a scaling math error.**
