# Prompt 11_cross_1 — Larger arena, diagonal movement, skillshot abilities, obstacle line-of-sight, ability tooltips

**Owner: the flagship agent (this chat), executed directly — not delegated to Raj/Marshall/En.** Load
`prompts/00_master_context.md` first. This is a single document covering all three packages
(`shared` → `server` → `client`, in that dependency order) because one person is both writing and running
it; still apply the exact same TDD/verification rigor as every prior prompt, phase by phase.

**Do not execute this yet.** Marshall asked for this prompt written now, for documentation, and will say
explicitly when to run it.

### Why this exists
Manual play after the Step 11 obstacle/arena-width round (`11_client_6`) surfaced five wanted improvements,
requested together: a modestly larger arena, diagonal WASD movement, "skillshot" (aim-then-click) targeting
for some abilities instead of always auto-hitting the opponent, obstacles blocking abilities (not just
movement — explicitly deferred as a "separate, later prompt" by `11_server_3`, which this prompt is), and
hover tooltips describing what each ability does.

### CRITICAL: scope decisions made here — read before executing, correct me if wrong
This request has real ambiguity in a few places. Rather than ask before writing the prompt, I picked the
most internally-consistent interpretation and I'm stating it plainly so Marshall can redirect any of it
before I run this:

1. **Which abilities become skillshots**: every `DAMAGE`, `CROWD_CONTROL`, and `POSITIONING` ability across
   the whole roster (8 of 10 abilities) becomes aim-then-click. Only `HEAL` abilities (Iron Skin, Vital
   Siphon — both currently self-targeted, instant) stay a single click with no aiming. This is a clean split
   along an axis the code already has (`effectType`), not a hand-picked subset, and it's easy to reason
   about and test. If Marshall wants only *some* `DAMAGE`/`CROWD_CONTROL` abilities to skillshot (e.g. just
   the ranged ones, keeping melee auto-hit), that's a smaller follow-up edit to the effect-type check below,
   not a redesign.
2. **What the click determines**: direction only, not distance. Clicking 50 units away from the caster and
   clicking 500 units away in the same direction aim identically — the ability still reaches its own
   `range`. This matches how the existing (soon-to-be-replaced) auto-target already works (range-gated, not
   distance-precise) and avoids needing a whole projectile-travel-time simulation.
3. **Hit resolution for `DAMAGE`/`CROWD_CONTROL` skillshots** (there is only ever one possible target in a
   1v1 game, so "aiming" really means "aiming roughly at the one opponent who exists"): three independent
   server-side checks, all required —
   - **Range**: `caster.position.distanceTo(opponent.position) <= ability.range` (unchanged from today).
   - **Aim alignment**: the opponent's perpendicular distance from the infinite ray cast from the caster in
     the clicked direction is `<= SKILLSHOT_HIT_RADIUS` (new constant, `packages/shared/src/domain/Arena.ts`,
     start at `40` arena units — tune during implementation if it feels too forgiving/strict once you can
     actually play it). Perpendicular distance from a point `O` to a ray from `C` in unit direction `D`:
     `abs((O.x - C.x) * D.y - (O.y - C.y) * D.x)`.
   - **Line of sight**: the segment from caster to opponent doesn't cross any `ARENA_OBSTACLES` rectangle
     (new geometry helper, see Phase 0).
   - If any check fails, the ability still consumes its cooldown and resource cost (a real "whiffed cast" —
     matches every skillshot-genre convention) but produces no effect. This is a deliberate, real gameplay
     consequence, not a bug.
4. **`POSITIONING` skillshots (blink/charge/reposition)**: currently these are silently broken — read the
   note in Phase 1 below, this prompt fixes a real pre-existing bug as a side effect. The destination is
   `caster.position + direction * ability.range`, then wall-clamped exactly like normal movement, then if
   the straight-line path from caster to that (clamped) destination crosses an obstacle, **reject the whole
   cast outright** (caster doesn't move, but the cooldown/resource are still consumed — same "whiffed cast"
   philosophy as above, and it mirrors `11_server_3`'s "reject the whole move" pattern for regular movement
   rather than inventing a new partial-teleport rule).
5. **Arena size**: `ARENA_WIDTH`/`ARENA_HEIGHT` go from `600`×`400` to `720`×`480` — a clean 20% increase on
   both dimensions, preserving the 1.5:1 ratio everything is already tuned to (obstacle placement, sprint-
   across timing, Vex's Arcane Bolt range vs. the diagonal). "A little larger" is inherently vague; 20%
   felt proportionate against the *previous* request's 50%-wider jump. Easy to change the two constants
   before executing if a different number is wanted.

---

## Phase 0 — `packages/shared` (must land first; both Phase 1 and Phase 2 depend on it)

### Scope
**1. Widen the arena.** `packages/shared/src/domain/Arena.ts`: `ARENA_WIDTH` 600→**720**, `ARENA_HEIGHT`
400→**480**. Rescale `ARENA_OBSTACLES` by the same 1.2× factor so the layout stays proportionally identical
(mirrored around the new horizontal center `x=360`, same relative clearance from spawns):
```ts
export const ARENA_OBSTACLES: readonly ArenaObstacle[] = [
  { x: 246, y: 156, width: 60, height: 120 }, // left-center pillar
  { x: 414, y: 156, width: 60, height: 120 }, // right-center pillar (mirror)
  { x: 330, y: 24, width: 60, height: 60 },   // top-center block (self-mirrored)
];
```
Re-verify what every prior arena-size prompt re-verified: new diagonal `√(720²+480²) ≈ 865.3` (Arcane Bolt's
600 range reaches proportionally *less* of it than before — same "welcome consequence" conclusion, restate
it, don't route around it); sprint-across time at the new width for all three champions (Korr 180spd: 4.0s,
Rin 200spd: 3.6s, Vex 220spd: 3.27s — still a few seconds); spawn positions `(50, 240)` /
`(670, 240)` (from the existing width-relative `SPAWN_WALL_MARGIN` formula, no code change needed there)
remain clearly outside every rescaled obstacle (nearest obstacle edge is 196 units from either spawn, more
clearance than before, not less).

**2. Obstacle line-of-sight helper.** Add to `Arena.ts`, alongside `isWithinObstacle`:
```ts
/** @returns true if the straight segment from (x1,y1) to (x2,y2) crosses any ARENA_OBSTACLES rectangle. */
export function segmentCrossesObstacle(x1: number, y1: number, x2: number, y2: number): boolean
```
Implement real segment-vs-axis-aligned-rectangle intersection (not just checking the two endpoints — a
segment can pass clean through a rectangle without either endpoint being inside it). A standard approach:
clip the segment against each of the rectangle's four edges (Liang–Barsky or Cohen–Sutherland), or check the
segment against all four edges as line-segment-vs-line-segment intersections. Write this with real tests
covering: a segment that passes fully through an obstacle (neither endpoint inside), a segment that starts
inside one, a segment that clips just a corner, and a segment that passes nearby but doesn't intersect at
all (false-positive check — don't over-block).

**3. `SKILLSHOT_HIT_RADIUS` constant.** New export in `Arena.ts` (or a new small file if that reads better),
value `40`, with a doc comment stating it's a tunable aim-forgiveness radius in arena units, not a hitbox
size.

**4. Ability descriptions.** Add a new `description: string` field to `packages/shared/src/domain/Ability.ts`
(constructor parameter, after `magnitude`). Update every `ChampionRoster.ts` `Ability` construction with the
following flavor text (matches the roster's existing dark-fantasy tone — use these verbatim, don't
freelance):
- Crushing Blow: `"A brutal overhead strike — cheap and quick, the bedrock of Korr's attrition game."`
- Shockwave Slam: `"Slams the ground in a short-range shockwave, staggering anyone caught in its arc."`
- Iron Skin: `"Hardens Korr's hide, mending wounds at the cost of a long cooldown."`
- Bulwark Charge: `"A shoulder-first charge that closes distance fast, shield raised."`
- Arcane Bolt: `"Vex's signature burst — the longest-ranged, hardest-hitting bolt in the roster, at a steep resource cost."`
- Frost Lance: `"A lance of frost that freezes its target in place on impact."`
- Phase Step: `"A short blink through the space between spaces, putting distance between Vex and danger."`
- Rending Strike: `"A quick, precise cut — Rin's bread-and-butter damage at close range."`
- Vital Siphon: `"Draws vitality through a melee strike, mending Rin's own wounds."`
- Swift Reposition: `"A burst of speed that repositions Rin instantly along her chosen line."`

### Process
1. Read `Arena.ts`, `Ability.ts`, `ChampionRoster.ts` in full (real current code) before writing anything.
2. Tests first for `segmentCrossesObstacle` (the geometry helper is the riskiest new code here — get real
   coverage of the false-positive/false-negative cases above before wiring it into anything).
3. Tests for the rescaled `ARENA_WIDTH`/`ARENA_HEIGHT`/`ARENA_OBSTACLES` (same rigor as `11_server_3`:
   obstacles don't span full width/height, mirrored placement, spawns clear).
4. Implement, `npm run typecheck -w @arena/shared`, full `packages/shared` Jest suite, real coverage numbers.
5. Update `docs/01_class_list.md` with a correction note for all of this (new arena dimensions/obstacle
   coordinates, `segmentCrossesObstacle`, `SKILLSHOT_HIT_RADIUS`, `Ability.description`), matching this
   project's established format.

---

## Phase 1 — `packages/server` (depends on Phase 0)

### CRITICAL: a real pre-existing bug this phase fixes as a side effect
`MatchModel.submitAbility` currently resolves `target = req.targetPlayerId ? opponent : caster`. The client
never sends `targetPlayerId` for `POSITIONING` abilities (only `DAMAGE`/`CROWD_CONTROL` are treated as
"offensive" client-side today) — so `target` is always the caster, and `caster.position = target.position`
is a no-op. **Every `POSITIONING` ability in the game (Bulwark Charge, Phase Step, Swift Reposition) is
currently non-functional** — it consumes cooldown and resource and does literally nothing. Confirm this
independently (read the real current code, don't take this prompt's word for it) before treating it as
expected — it should surprise nobody once confirmed, since nothing in this codebase's existing test suite
actually asserts a `POSITIONING` ability *moves the caster*, only that it doesn't throw. This phase's
skillshot rework fixes it for real, as a direct consequence of giving `POSITIONING` an actual aimed
destination instead of a same-as-caster no-op target.

### Scope

**1. Diagonal movement, normalized server-side.** `ParticipantState.move(direction, deltaSeconds, now)`
currently applies `direction.dx`/`direction.dy` directly — a diagonal input like `{dx:-1,dy:-1}` has
magnitude `√2`, moving diagonally ~41% faster than a cardinal direction. Fix this **in `move()` itself**
(server-authoritative — master context §1.1 — so a modified client can't send an unnormalized vector for a
speed boost either): compute `magnitude = Math.hypot(direction.dx, direction.dy)`; if `magnitude > 0`, use
`direction.dx / magnitude` and `direction.dy / magnitude` in place of the raw values when computing the new
position; if `magnitude === 0`, no movement (guard the division — don't produce `NaN`). Test: a diagonal
move over N ticks covers the same distance as a cardinal move over the same N ticks and duration (not just
"doesn't throw" — assert the actual distance traveled, matching this project's established rigor for
movement tests). Also test the zero-vector guard explicitly.

**2. Skillshot targeting.** Extend `MatchModel.submitAbility`'s request type to accept the existing
(currently unused — check `packages/shared/src/contract/payloads.ts`, `AbilityUseRequest.targetPosition` is
already defined and wired through the type but nothing ever populates or reads it) `targetPosition?: Position`
field. New resolution logic, replacing the current `target = req.targetPlayerId ? opponent : caster` line:
   - `EffectType.HEAL`: unchanged — always self-targeted, no `targetPosition` needed, instant.
   - `EffectType.DAMAGE` / `EffectType.CROWD_CONTROL`: require `req.targetPosition`; compute the unit
     direction from caster to it (guard the zero-length case — if `targetPosition` equals the caster's own
     position, treat as a whiffed cast, no direction to aim); run the three checks from the CRITICAL section
     above (range, aim alignment via `SKILLSHOT_HIT_RADIUS`, line-of-sight via `segmentCrossesObstacle`
     against the *opponent's real position*, not the clicked point); apply the effect only if all three
     pass; consume cooldown/resource unconditionally (via the existing `caster.useAbility(ability, now)`
     call) regardless of hit/miss.
   - `EffectType.POSITIONING`: require `req.targetPosition`; compute the unit direction the same way;
     destination `= caster.position + direction * ability.range`, wall-clamped via the exact same
     `Math.max(0, Math.min(ARENA_WIDTH, …))` pattern `ParticipantState.move()` already uses; if
     `segmentCrossesObstacle(caster.x, caster.y, destination.x, destination.y)`, reject the cast outright
     (caster doesn't move; cooldown/resource still consumed, matching the whiffed-cast philosophy above);
     otherwise `caster.position = destination`.
3. **Keep `req.targetPlayerId` accepted but no longer meaningful for anything except a defensive check**:
   if you find any other caller/test still depends on it, don't silently break it — read before removing.

### TDD process
1. Read the real current `ParticipantState.move()`, `MatchModel.submitAbility()`, and
   `packages/shared/src/contract/payloads.ts` in full before writing anything.
2. Tests first, per sub-feature, before implementing each:
   - Diagonal movement distance-parity + zero-vector guard (above).
   - `POSITIONING` abilities actually move the caster now (this is the regression test that would have
     caught the pre-existing no-op bug — write it to fail against a stashed copy of the old code first, so
     you know it's a real test, not a tautology).
   - `DAMAGE`/`CROWD_CONTROL` skillshot: hits when aimed correctly within range and unobstructed; misses
     (no effect, but cooldown/resource still spent) when aimed away from the opponent, when out of range
     despite good aim, and when an obstacle sits on the line between caster and opponent despite good aim
     and range — three separate miss reasons, three separate tests, don't conflate them.
   - `POSITIONING` skillshot: moves the caster the full `range` in the aimed direction when clear; wall-
     clamps correctly at an arena edge; rejects the whole cast (no movement, but cooldown/resource still
     spent) when the path crosses an obstacle.
3. Implement, `npm run typecheck -w @arena/shared -w @arena/server`, full `packages/server` Jest suite, real
   coverage numbers.
4. `docs/01_class_list.md` correction notes for the new `submitAbility` targeting model and the diagonal-
   movement normalization, matching the established format.

---

## Phase 2 — `packages/client` (depends on Phase 0 and Phase 1)

### CRITICAL: this phase deliberately changes an existing interaction contract
Every prior client visual prompt in this project has stressed *preserving* e2e selectors and interaction
contracts untouched. This one is different by design: casting a `DAMAGE`/`CROWD_CONTROL`/`POSITIONING`
ability now genuinely requires a second click (aim), where it used to be a single click. This is an
intentional behavior change the user asked for, not a regression to avoid. **What still must not change**:
every existing `aria-label` and button/heading string (`ability-controls`, `Move Up/Down/Left/Right`,
ability names, etc.) — only the *number of clicks/interactions* needed to cast most abilities changes.
`e2e/match.spec.ts`'s `castArcaneBoltAndWaitForCooldown` helper (used in both the main match test, ~line 42,
and the reconnection/persistence test, ~line 201-206) currently does a single `.click()` on the ability
button — **this must be updated to click the ability button, then click a point in the `arena` element
roughly toward the opponent**, matching the new real interaction. Update it once, in the helper, so both
call sites pick up the fix.

### Scope

**1. Diagonal WASD.** `MatchHUDScreen`'s held-key movement effect (`packages/client/src/view/MatchHUDView.tsx`,
the `heldKeys` `Set`/`dispatchHeldMoves` logic from `11_client_3`) currently calls
`controller.operation('move', WASD_DIRECTIONS[key])` **once per held key**, every interval tick — meaning
two keys held together already both attempt to fire, but `MatchController`'s 50ms throttle silently drops
all but the first, so today holding W+A moves only in whichever direction happened to iterate first in the
`Set`, never diagonally. Fix: compute one **merged** direction per tick from every currently-held key (sum
each axis: e.g. `w`+`a` held → `{dx: -1, dy: -1}`; opposite keys held together, e.g. `w`+`s`, cancel to `0`
on that axis) and dispatch **one** `controller.operation('move', mergedDirection)` call per interval tick,
not one per key. Do not normalize this vector client-side — Phase 1 already normalizes it authoritatively
server-side; sending the raw summed `{-1,0,1}`-per-axis vector is correct and matches "server is sole source
of truth" (master context §1.1). Skip dispatching entirely when the merged vector is `{0,0}` (no held keys,
or opposite keys canceling) — no point emitting a no-op move.

**2. Skillshot aim-then-click UX.** For any ability whose `effectType` is `DAMAGE`, `CROWD_CONTROL`, or
`POSITIONING`: clicking its on-screen button, or pressing its 1-4 hotkey, must **not** immediately cast it —
instead enter a per-view "currently aiming: {abilityId}" state. While aiming:
   - Provide a real visual indicator (this project's whole `11_client_4` prompt existed because "nothing
     visible happens" reads as a broken button — don't regress that lesson). Minimum bar: extend the
     existing `hoveredAbilityId`-driven range ring so it also shows while aiming (reuse, don't reinvent),
     and visually mark the aiming ability's button as active/pressed (a new CSS state, e.g.
     `.btn-ability--aiming`, matching the existing `--cooldown`/`--out-of-range` modifier-class pattern).
   - The **next click inside the `arena` element** (not on a button) is the aim point: convert the click's
     pixel coordinates back into arena-space game units — this is the exact inverse of `toRenderPixels()`,
     which already exists in this file; write the inverse function next to it, don't duplicate the math
     inline — then dispatch `controller.operation('useAbility', { abilityId, targetPosition: { x, y } })`
     and exit aiming mode.
   - Pressing the **same** ability's hotkey again while already aiming cancels aim mode (toggle off, no
     cast). Pressing a **different** ability's hotkey while aiming switches aim mode to the new ability
     (silently cancels the old one, no cast). `HEAL` abilities are unaffected — clicking/pressing them casts
     immediately exactly as today, no aiming.
   - `MatchController.operation('useAbility', payload)` already forwards whatever payload it's given
     unthrottled — no controller-layer change needed there, this is entirely a view-layer state machine.

**3. Non-square arena, obstacle rendering, projectile animation** — mostly automatic. `ARENA_WIDTH`/
`ARENA_HEIGHT`/`ARENA_OBSTACLES` come from Phase 0's shared package; `computeArenaRenderSizePx()` (already
generic over any aspect ratio, from `11_client_6`) and the obstacle-rendering `.map()` over `ARENA_OBSTACLES`
(also from `11_client_6`) need no code changes for the new size — verify this by actually loading the app
and confirming the wider/taller arena and rescaled obstacles render correctly, don't just assume it from
reading the old code. The existing `spawnCastEffect({ kind: 'projectile', … })` cast-feedback animation
(`11_client_4`) currently always animates toward the *opponent's* rendered position — for a skillshot, it
should animate toward the **clicked aim point** instead (whether the cast hits or misses; a miss should
still show the bolt flying off in the aimed direction, not silently do nothing — this is exactly the kind of
"the button worked but gave zero feedback" gap this whole project keeps finding and fixing).

**4. Ability description tooltips.** On hover (or focus, for keyboard/a11y parity with the existing
`onFocus`/`onBlur` range-ring handlers) over an ability — both the `ability-controls` buttons in
`MatchHUDScreen` and the `ability-chip` list items in `ChampionSelectScreen` — show `ability.description`
(now populated by Phase 0) in a tooltip. A plain `title` attribute is the simplest correct option and gets
real hover-tooltip behavior for free from the browser with zero new markup; a custom-styled tooltip matching
the dark-fantasy aesthetic is a nicer but optional upgrade — your call, don't let visual polish here block
finishing the rest of this prompt.

### Process
1. Read the real current `MatchHUDView.tsx` and `ChampionSelectView.tsx` in full (post-Phase-0/1) before
   writing anything — this file has grown a lot across prior prompts, don't work from a stale mental model
   of it.
2. Build diagonal movement first (smallest, most isolated change), verify it manually, then the aim-then-
   click state machine, then tooltips, then update `e2e/match.spec.ts`'s helper last (once the real UI
   behavior it needs to drive actually exists).
3. Full client Jest suite, then update and run the full Playwright e2e suite (`npm run test:e2e`), twice in
   a row from a cold `docker compose -f docker-compose.test.yml down -v` — this one especially needs the
   twice-cold-run discipline given how much of the e2e suite's own interaction pattern is changing.
4. Load the app in a real browser and play a real two-player match. Specifically confirm, don't assume:
   held W+A actually moves diagonally (not just one axis); a `DAMAGE` skillshot aimed correctly hits and
   aimed away misses with visible cast-effect feedback either way; a `POSITIONING` skillshot actually moves
   the caster (confirming the pre-existing bug is really fixed); an obstacle placed between caster and
   opponent blocks a skillshot that would otherwise hit; hovering an ability shows its description in both
   Champion Select and the match HUD. Describe exactly what you observed for each, in the PR description.

---

## Verification and Git (applies across all three phases)
Report real `npm run typecheck` and full Jest output (with coverage) for `packages/shared`,
`packages/server`, and `packages/client`, plus two full cold-start Playwright e2e runs. Given this is one
person executing all three phases directly rather than three separate people/branches, use your judgment on
whether to land this as one PR or three sequential ones (shared → server → client) — three is more
reviewable and matches this project's established granularity, but don't let process overhead block actually
finishing the feature. Branch from `main` (check `git log` for divergence first), commit message(s)
describing what changed and why (referencing the fixed `POSITIONING` no-op bug explicitly, since that's a
real, notable side effect), push, open PR(s) into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: don't trust that Phase 0's geometry helper or Phase 1's hit-resolution math is correct just
because it typechecks and the happy-path test passes — these are the riskiest parts of this whole prompt
(line-segment-vs-rectangle intersection and ray-vs-point perpendicular distance are both easy to get subtly
wrong at the boundaries). Specifically stress-test: a skillshot aimed exactly along an obstacle's edge, a
`POSITIONING` destination that lands exactly on an obstacle's boundary, and a diagonal move directly into a
corner where two obstacles' bounding boxes nearly meet. If any of these behave surprisingly, fix the real
issue rather than special-casing around it.**
