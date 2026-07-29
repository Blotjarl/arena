# Prompt 11_client_6 — Render the wider arena and the real obstacles

**Owner: Raj.** Load `prompts/00_master_context.md` first.

### CRITICAL prerequisite
**`11_server_3_wider-arena-and-obstacles.md` must be merged first** — this prompt renders the real, exported
`ARENA_WIDTH` and `ARENA_OBSTACLES` from `packages/shared`, it does not invent its own numbers. Also
depends on `11_client_5_fix-initial-render-and-verify-input.md` having merged (this file is
`MatchHUDView.tsx`, which that prompt also touches — avoid working from a stale copy).

### CRITICAL: same hard constraint as every prior visual prompt on this file
Every `aria-label` and button/heading string the e2e suite depends on (see `11_client_2`'s prompt for the
compiled list) stays untouched. The `arena` container is no longer square (`ARENA_WIDTH` ≠ `ARENA_HEIGHT`
after `11_server_3`) — update the rendering to a non-square aspect ratio without breaking the `arena`
element's `aria-label` or its role as the positioning context for the markers.

---

### Scope

**1. Non-square, wider arena rendering.** `toRenderPixels()` already scales `x` and `y` independently by
`ARENA_WIDTH`/`ARENA_HEIGHT` respectively (`11_client_3`) — that math doesn't need to change. What does:
the arena's rendered CSS box was a fixed square (`width: arenaRenderSizePx; height: arenaRenderSizePx`);
it needs to become a rectangle matching the new `ARENA_WIDTH : ARENA_HEIGHT` ratio (1.5:1) while still
fitting reasonably within the viewport (reuse `11_client_4`'s `computeArenaRenderSizePx()` viewport-fitting
approach, adapted for two dimensions instead of one square size).

**2. Render the real obstacles.** For each entry in `ARENA_OBSTACLES`, render a positioned, styled
rectangle inside the arena, scaled through the same `toRenderPixels()`-style math the markers already use
(an obstacle's `x`/`y`/`width`/`height` are all in `ARENA_WIDTH`/`ARENA_HEIGHT` game-logic units, same as a
participant's position — scale all four the same way). Match this project's established dark-fantasy
pixel-art aesthetic (reuse `styles.css`'s existing palette — `--color-border-strong`,
`--color-bg-elevated`, etc. — and the `shapeRendering="crispEdges"` inline-SVG technique from
`11_client_3`'s champion sprites if you want textured obstacles, or a simpler solid-fill styled div if
that reads better — your call). These are purely decorative/positional on the client — the server already
enforces collision; this prompt's job is making sure a player can *see* why their character stopped.

### Process
1. Read the current `MatchHUDView.tsx` (post `11_client_5`) and `11_server_3`'s merged
   `ARENA_OBSTACLES`/`ARENA_WIDTH` export in full before writing anything.
2. Build the non-square arena sizing first, verify it against the existing e2e suite (the arena's own
   `aria-label` and the markers' positioning must keep working), then add obstacle rendering.
3. Full client Jest suite, then the full Playwright e2e suite (`npm run test:e2e`), twice in a row from a
   cold `docker compose -f docker-compose.test.yml down -v`.
4. Load the app in a real browser and play a match — confirm the arena reads as wider (not just a bigger
   square), the obstacles are visible and positioned sensibly, and moving a character into one actually
   stops them (server-enforced, but confirm the visual matches what the server does). Describe what you
   see in your PR description.

---

### Verification and Git
Report the real output of the full client Jest suite and the full Playwright e2e suite (both full runs).
Branch `client` from `main` (check `git log` for divergence first — pull before you start), commit `Step
11: render the wider arena and server-authoritative obstacles`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: manually drive a character into an obstacle through the real UI and confirm the visual stop
position matches where the server actually stopped them (check the server's real collision behavior, don't
just eyeball "it looks about right") — a client-side obstacle that's drawn in a slightly different place
than where the server's collision box actually is would be its own confusing bug.**
