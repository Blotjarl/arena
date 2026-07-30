# Prompt 11_client_8 — Visual overhaul: characters, abilities, arena (dark-fantasy pixel-art)

**Owner: the flagship agent (this chat), executed directly — not delegated.** Load
`prompts/00_master_context.md` first. Client-only, purely presentational — no shared/server logic changes,
no new npm dependencies, no binary image assets (same constraint `11_client_3` established: "this project
has no image-generation tooling and no reason to add binary image assets to the repo" — everything here is
hand-authored inline SVG and plain CSS, same as every visual prompt before it).

**Do not execute this yet.** Marshall asked for this prompt written now, for documentation, and will say
explicitly when to run it.

### Why this exists
Marshall asked for a visual pass advancing characters, abilities, and the arena, specifically in "dark-
fantasy pixelated" style. That phrase is not a new direction — it's this project's own already-established,
named aesthetic goal (`11_client_3`'s own words: "dark fantasy pixelated art style"). What exists today,
confirmed by reading the real current code before writing this, is a first pass at that goal, not a finished
one:
- **Champion sprites**: three 11×12/13-cell inline-SVG pixel grids (`CHAMPION_SPRITES` in
  `packages/client/src/view/MatchHUDView.tsx`), 4px per cell, a 4-character legend (`O`=outline,
  `B`=body/champion-accent-colored, `E`=eye, `A`=accent). Simple, readable at a glance, but not detailed —
  `11_client_3`'s own prompt explicitly scoped them as "roughly 8–16 pixels per side is plenty," a
  deliberately minimal first cut.
- **Ability icons**: four inline-SVG glyphs, **one per `EffectType`** (`AbilityIcon` in the same file), not
  one per individual ability — `11_client_4`'s own prompt explicitly scoped this as "effect-type legibility,
  not per-ability uniqueness." Real, current gap found while reading the code for this prompt: the four
  effect-type icons are also **not color-differentiated** — `.ability-icon { color: var(--color-accent); }`
  is the only rule in `styles.css`, so DAMAGE/HEAL/CROWD_CONTROL/POSITIONING icons all render the same gold
  regardless of type, despite the `.ability-icon--damage`/`--heal`/`--cc`/`--positioning` modifier classes
  already existing in the markup with nothing styling them.
- **Arena**: a flat 45° repeating-stripe gradient floor and flat-gradient-card obstacles — functional,
  server-authoritative-accurate, but not textured or "ruined dungeon"-feeling.
- **Champion Select has no sprite at all** — confirmed by reading `ChampionSelectView.tsx` in full: only
  text, a stat bar, and an accent-colored top border. `ChampionSprite`/`CHAMPION_SPRITES` are private to
  `MatchHUDView.tsx` and not currently reusable anywhere else.

This prompt deepens the existing direction rather than pivoting it — same palette, same "hard-edged pixel
sprites against otherwise soft dark-UI chrome" contrast, same you-blue/opponent-red duality, same
per-champion accent-hue system (`--color-korr`/`--color-vex`/`--color-rin`).

### CRITICAL: preserve every one of these exactly — read before executing
This is a *visual* pass; it must not become a functional regression. The following selectors/strings are
either part of the `11_client_2`-established e2e contract (`e2e/match.spec.ts`, still governing) or asserted
on directly by `MatchHUDScreen.test.tsx` — confirmed by reading both before writing this:
- Every `aria-label` and exact button/heading text already in place (`arena`, `you-marker`,
  `opponent-marker`, `you-hud`, `opponent-hud`, `you-cooldowns`, `movement-controls`, `ability-controls`,
  `disconnect-banner`, `champion-roster`, `identify-form`, `Move Up/Down/Left/Right`, dynamic ability names
  as each button's accessible text, `Select {championName}`, etc.) — restyle freely, rename nothing.
- `cast-effect`, `cast-effect--mine`, `cast-effect--opponent`, `cast-effect--projectile`,
  `cast-effect--pulse`, and the inline `--dx`/`--dy` CSS custom properties — `MatchHUDScreen.test.tsx`
  queries these exact class combinations and reads `--dx` directly (e.g. line ~438). Add new modifier
  classes alongside these for effect-type-specific shape/color variation (see Ability scope below); do not
  rename or remove the existing ones.
- `damage-popup`, and its exact `-{amount}` text content format (asserted verbatim, e.g. `'-30'`).
- `btn-ability--aiming` (asserted in multiple `MatchHUDScreen.test.tsx` cases).
- `ability.name` stays each ability button's accessible text (icons/hotkey badges around it are already
  `aria-hidden`, so restyling those is always safe).

### Performance note
This renders during real-time combat at up to 20 real ticks/sec (server tick rate) plus whatever the
browser's own paint rate is for CSS animations. Keep new animations cheap (`transform`/`opacity`, not
`box-shadow`/`filter`-heavy properties animating every frame) and keep obstacle/floor texture DOM-light
(a handful of gradient layers or a single reusable inline SVG pattern, not dozens of new elements per
obstacle) — the same discipline `11_client_3`/`11_client_4` already applied to the existing sprites/cast
effects.

---

### Scope A — Characters

**1. Extract the sprite system into its own shared module**, `packages/client/src/view/ChampionSprite.tsx`
— `CHAMPION_SPRITES`, `SPRITE_CELL_PX`, `SPRITE_PIXEL_COLORS`, and the `ChampionSprite` component itself,
moved out of `MatchHUDView.tsx` and exported. `MatchHUDView.tsx` imports `ChampionSprite` from the new
module instead of defining it locally. This is what makes Scope A.3 (below) possible without duplicating
sprite data, and is worth doing regardless — a sprite renderer buried as a private implementation detail of
one screen was always going to need this once a second screen wanted it.

**2. Advance the sprite grids themselves.** Bigger and more detailed than the current 11×12/13 cells at
4px/cell — this project's arena and UI have both grown since `11_client_3` first drew these (1.5x, then a
further 20% wider); the sprites reading as small, plain silhouettes is now more noticeable, not less.
Concretely:
   - Grow the grid (aim for roughly 16-20 cells per side — still small enough to read instantly during fast
     combat, per `11_client_3`'s own original constraint, just meaningfully more detailed than today) and/or
     grow `SPRITE_CELL_PX` (e.g. 4→5 or 6) so the result reads as a real upgrade on screen, not just more
     data at the same visual size.
   - Extend the legend beyond the current four characters (`O`/`B`/`E`/`A`) as needed for shading/highlight/
     weapon-glint detail — e.g. a darker shadow tone, a lighter highlight tone, a distinct weapon/metal
     color. `SPRITE_PIXEL_COLORS` already maps characters to CSS values freely; there's no external
     contract on what characters exist, only that `B` (or whatever ends up meaning "body") should keep
     resolving through `--champion-accent` so recoloring by champion keeps working without touching the
     grids themselves.
   - Keep each champion's silhouette distinct and matching their established identity (Korr: bulky
     bruiser/armor; Vex: slender robed mage; Rin: lean angular duelist) — same design brief `11_client_3`
     gave, just executed with more visual fidelity this time.
   - Preserve the "sprite's own colors say who, surrounding glow says whose side" split `11_client_3`
     established — don't fold the you/opponent blue-red distinction into the sprite itself.

**3. Render a sprite on Champion Select too**, using the newly-extracted `ChampionSprite` component — one
per champion card, alongside the existing name/role/stats/abilities. This is a real, currently-missing
piece of visual identity on the one screen where a player is actively choosing between three characters by
name alone. Purely additive to that screen's existing markup; no `aria-label`/button-text changes needed
there either (the sprite is decorative, `aria-hidden`, exactly like it already is in the match HUD).

**4. Nice-to-have, don't let it block finishing the rest of this prompt if it turns out to be more complex
than expected**: a subtle CSS idle animation (a gentle bob/breathing translateY oscillation is enough — cheap,
`transform`-only, matches the performance note above) on the match-HUD sprites, and/or horizontal flip
(`transform: scaleX(-1)`) to face the direction of last horizontal movement. If you attempt facing, derive it
from the sign of the most recently submitted move's `dx` (or the interpolated position delta between ticks)
— a small piece of new transient view state, not anything server-authoritative, and not worth a large design
detour if it fights the existing render loop.

---

### Scope B — Abilities

**1. Per-ability icons, not just per-effect-type.** Extend `AbilityIcon` (or replace it with a new
per-ability lookup — your call on the exact mechanism) to render a distinct glyph per `ability.id`, all ten:
`crushing-blow`, `shockwave-slam`, `iron-skin`, `bulwark-charge`, `arcane-bolt`, `frost-lance`, `phase-step`,
`rending-strike`, `vital-siphon`, `swift-reposition`. Same inline-SVG technique already established, same
`aria-hidden` wrapper (the accessible name stays `ability.name`, per the CRITICAL section above). Match each
icon to its real ability flavor, not just its `effectType` — e.g. a warhammer/impact shape for Crushing
Blow vs. a slashing-claw shape for Rending Strike, even though both are `DAMAGE`. **Fall back to the current
per-effect-type icon for any `ability.id` not explicitly covered** (defensive, same "unknown championId
falls back to Korr's grid" pattern `ChampionSprite` already uses) — this should never actually trigger once
all ten are covered, but keeps the component from rendering nothing if the roster ever grows.

**2. Color-code icons by effect type** — the real, currently-unstyled gap found above. Give
`.ability-icon--damage`/`--heal`/`--cc`/`--positioning` distinct `color` values in `styles.css` (they already
exist as classes on the markup, doing nothing). Reasonable starting point, adjust by eye once you can see it
rendered: damage → `var(--color-danger)`, heal → `var(--color-success)`, crowd control → `var(--color-warning)`,
positioning → `var(--color-you)` or `var(--color-accent)` (positioning doesn't have an obviously "correct"
existing color the way damage/heal/danger do — your call, state your reasoning in the PR).

**3. Effect-type-specific cast-effect shape/color**, layered on top of (not replacing) the existing
`cast-effect--projectile`/`cast-effect--pulse`/`--mine`/`--opponent` classes and `--dx`/`--dy` mechanism —
add a new modifier class (e.g. `cast-effect--damage`/`--heal`/`--cc`/`--positioning`, matching the
`AbilityIcon` modifier naming already established) that changes shape (a sharp diamond via `clip-path` for
DAMAGE, a soft cross-pulse for HEAL, a jagged/faceted shape for CROWD_CONTROL, a streaking/elongated blur for
POSITIONING) and/or color, purely additive CSS — the existing class names, the `cast-travel`/`cast-pulse`
keyframes, and the `--dx`/`--dy` custom properties driving the actual motion all stay exactly as they are.

---

### Scope C — Arena

**1. Floor texture.** Replace or layer onto the current flat 45° repeating-stripe gradient
(`.arena`'s `background`) with something that reads as worn stone/dungeon floor rather than a plain diagonal
stripe — layered gradients (a subtle darker vignette toward the arena's edges, a second faint irregular
gradient layer suggesting worn/uneven stone) is enough; this doesn't need a repeating image-based tile
pattern (no image assets, per the top-level constraint) — CSS gradients layered via multiple
`background` values, or a single reusable inline SVG pattern (`<pattern>` + `<rect fill="url(#...)">`)
referenced as a `background-image: url("data:image/svg+xml,...")`, are both reasonable, keep it cheap per the
performance note.

**2. Obstacle texture.** Currently a flat diagonal-gradient card. Upgrade toward "ruined pillar/rubble" —
either richer CSS (a jagged silhouette via `clip-path`, layered inset shadows suggesting cracked stone) or a
small reusable inline-SVG texture in the same `shapeRendering="crispEdges"` pixel-art technique the champion
sprites use (this doesn't need to be a full pixel-grid sprite per obstacle — even a simple crisp-edged
rectangle-with-notches reads as "pixel-art rubble" at this size). All three obstacles can reasonably share
one texture/pattern (they're plain rectangles positioned/sized differently, not individually authored
shapes) — no need to hand-author three distinct designs.

**3. Keep exact.** `ARENA_OBSTACLES`' real positions/sizes (from `packages/shared`), the `arena`/
`arena-obstacle` `aria-label`/class hooks, and `computeArenaRenderSizePx()`'s sizing formula — this scope is
purely "make what's already there look better," not "change where anything is or how big the arena renders."

---

### Process
1. Read the real current `MatchHUDView.tsx`, `ChampionSelectView.tsx`, and `styles.css` in full before
   writing anything — this prompt was written against a specific snapshot of all three; confirm nothing has
   drifted since (this project's client views have grown substantially across many prior prompts).
2. Extract `ChampionSprite` first (Scope A.1) — mechanical, low-risk, and everything else in Scope A depends
   on it existing as an importable module.
3. Work through Scopes A, B, C in whatever order feels natural — they're independent of each other (A
   touches sprites, B touches abilities/cast-effects, C touches the arena background/obstacles) and none
   blocks the others.
4. New/updated tests as you go, not as an afterthought:
   - A real test proving `AbilityIcon` (or its replacement) renders visibly distinct markup for at least a
     few different `ability.id`s sharing the same `effectType` (e.g. Crushing Blow vs. Rending Strike, both
     DAMAGE) — proving per-ability icons actually exist, not just that *an* icon renders.
   - A test confirming Champion Select now renders a `ChampionSprite` per roster entry (query for whatever
     the extracted component's root element/class ends up being).
   - If you implement facing-direction (Scope A.4), a real test for the direction-derivation logic, not just
     "doesn't throw."
   - Confirm every existing `MatchHUDScreen.test.tsx` test listed in the CRITICAL section above still passes
     unmodified — if any genuinely need updating (e.g. because you added a new required modifier class this
     project's own convention would want asserted), update them deliberately and explain why in the PR, don't
     just delete an inconvenient assertion.
5. Full client Jest suite, `npm run typecheck -w @arena/client`, real coverage numbers.
6. Run the full Playwright e2e suite (`npm run test:e2e`), twice in a row from a cold
   `docker compose -f docker-compose.test.yml down -v` — this is the real backstop proving the visual pass
   didn't silently break the `11_client_2` selector contract.
7. Load the app in a real browser and actually look at it: Champion Select (new sprites), a real two-player
   match (advanced character sprites, per-ability icons and their colors, cast effects for at least one
   DAMAGE and one non-DAMAGE ability, the new arena floor/obstacle texture), and confirm nothing looks
   broken at the actual rendered arena size (not just "compiles"). Describe what you see in the PR
   description — this is a visual prompt; "the tests pass" is not sufficient evidence it looks good.
8. Brief `docs/01_class_list.md` note for the new `ChampionSprite.tsx` module (it's a real, separate,
   exported component now reused by two screens, not a private implementation detail of one) — doesn't need
   the same exhaustive treatment as a logic-heavy prompt's correction notes, a few sentences is enough.

---

### Verification and Git
Report real `npm run typecheck` and full Jest output (with coverage) for `packages/client`, plus two full
cold-start Playwright e2e runs, plus what you actually observed looking at the running app (per Process
step 7). Branch from `main` (check `git log` for divergence first), commit message describing what changed
and why, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this is the first prompt in this project whose entire point is "looks better," not "works
correctly" — passing tests and a clean typecheck are necessary but not sufficient. Actually look at the
rendered result in a real browser at real size before calling this done, the same way `11_client_2` through
`11_client_6` all did. If something you built reads as worse, busier, or less legible at a glance during
fast combat than what existed before — even if it's technically "more detailed" — that's a real regression
against this project's own stated design goal ("needs to read clearly at a glance during fast combat," per
`11_client_3`), not a matter of taste to wave off.**
