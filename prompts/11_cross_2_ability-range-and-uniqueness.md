# Prompt 11_cross_2 — Ability range correctness, unique skillshot visuals, unique mechanics

**Owner: the flagship agent (this chat), executed directly — not delegated**, matching `11_cross_1`'s
pattern (a single cross-package prompt, one person executing end to end, rather than split across
tracks/owners). Load `prompts/00_master_context.md` first. Touches `packages/shared` (one new local
constant, no domain-class shape changes), `packages/server` (`MatchModel.submitAbility`), and
`packages/client` (`MatchHUDView.tsx`, `styles.css`).

**Do not execute this yet.** Marshall asked for this written now; execute only when told explicitly.

### Why this exists
Marshall asked for three related things: abilities should be genuinely unique (not just numbers),
skillshots should never visually extend past their own range, and different abilities should shoot
projectiles at different speeds with distinct visuals. Verified against the real current code (not
assumed) before writing this:

- **Confirmed real bug — cast-effect visuals ignore range entirely.** `MatchHUDScreen`'s cast-effect
  spawn logic (`MatchHUDView.tsx`, the tick-diff `useEffect` around the `spawnCastEffect({ kind:
  'projectile', ... to, ... })` call) sets `to` to the player's own **raw recorded click point**
  (`lastAimPointRef`), never clamped to `ability.range`. Server-side, `MatchModel.submitAbility` only
  ever uses the click to extract a **direction** — `aimMagnitude` (the click's own distance) is computed
  once to normalize `dirX`/`dirY` and then discarded; hit resolution for `DAMAGE`/`CROWD_CONTROL` checks
  `caster.position.distanceTo(opponent.position) <= ability.range` (opponent's real distance, never the
  click's), and `POSITIONING` always resolves to exactly `caster.position + direction * ability.range`
  (wall-clamped), regardless of whether the click was short of or far past that distance — proven by
  `MatchModel.test.ts`'s own `'CRITICAL: actually moves the caster the full ability range...'` test,
  which clicks only 100 units away with a 300-range ability and asserts the caster still travels the
  full 300. **Net effect**: click anywhere far away with a short-range ability (e.g. Crushing Blow,
  range 75) and, if the opponent happens to be within real range/aim-alignment, the cast connects
  exactly as it should — but the visual projectile flies all the way to your literal click point,
  potentially clear across the arena. This is the concrete bug behind "should not fire past its range."
- **Confirmed real bug — skillshot aim has no forward-facing check.** The aim-alignment test in
  `submitAbility` (`perpendicularDistance = Math.abs(ox * dirY - oy * dirX)`, compared to
  `SKILLSHOT_HIT_RADIUS`) measures perpendicular distance from the opponent to the **infinite line**
  through the caster along the aim direction — not a bounded ray. Nothing checks that the opponent is
  actually in *front* of the caster relative to where they clicked. A player who clicks in completely
  the wrong direction can still land a hit if the opponent happens to be colinear-ish behind them. A
  real, if subtle, correctness gap — not what "aiming" is supposed to mean.
- **Confirmed: every ability resolves through 100% generic, effect-type-only logic.** A grep-equivalent
  scan of `MatchModel.submitAbility`/`ParticipantState` turns up zero occurrences of `ability.id`
  anywhere in resolution logic — only `effectType`/`magnitude`/`range` are ever read. All three `DAMAGE`
  abilities call the identical `opponent.applyDamage(ability.magnitude)`; both `CROWD_CONTROL` abilities
  call the identical `opponent.applyCrowdControl(ability.magnitude * 1000, now)`; all three `POSITIONING`
  abilities resolve via the identical `caster.position + direction * ability.range` formula; both `HEAL`
  abilities call the identical `caster.applyHeal(ability.magnitude)`. Every ability's own flavor text
  (already written, `ChampionRoster.ts`) describes something more specific than its generic bucket for at
  least four of them — see Scope E.
- **Confirmed: cast-effect travel time is a single fixed `0.5s` for every ability**, regardless of
  `ability.range` or which ability it is (`CAST_EFFECT_DURATION_MS = 500` in `MatchHUDView.tsx`;
  `.cast-effect--projectile { animation: cast-travel 0.5s ... }` in `styles.css`) — a 75-range melee hit
  and a 600-range bolt currently take exactly the same wall-clock time to visually resolve.
- **Confirmed: `11_client_8`'s per-ability icon work (`ABILITY_ICON_GLYPHS`) has no cast-effect
  counterpart.** Ability *buttons* got distinct icons per `ability.id`; the *in-flight projectile* during
  actual combat still only varies by `EffectType` (4 shapes total, from `11_client_8` Scope B.3), so e.g.
  Crushing Blow and Rending Strike (both `DAMAGE`) still fire visually-identical projectiles.

### CRITICAL: preserve every one of these — read before executing
- Every `aria-label`/button-text/heading-text in the `11_client_2` e2e contract, unchanged.
- `cast-effect`, `cast-effect--mine`/`--opponent`/`--projectile`/`--pulse`, the `--dx`/`--dy` custom
  properties, and the `cast-effect--damage`/`--heal`/`--cc`/`--positioning` modifier classes from
  `11_client_8` — this prompt adds to these (new per-ability modifier classes, a computed
  animation-duration), it does not rename or remove any of them.
- `btn-ability--aiming`, `damage-popup`'s exact `-{amount}` text, `.arena`/`.arena-obstacle`.
- The "consumes cooldown/resource on a whiff" pattern (`caster.useAbility(ability, now)` called before
  hit resolution, unconditionally) — every scope below preserves this; a miss still costs the caster.
- `master context §1.1` — the server remains sole source of truth for every outcome. Every visual change
  below (range-clamped cast-effect distance, per-ability travel speed, per-ability shapes) is the client
  *approximating* an outcome that has already been decided server-side by the time the animation plays
  (the cast-effect only ever spawns after observing a real cooldown transition in a real tick snapshot) —
  none of it changes what actually happens to any participant's position/health/resource.
- `e2e/match.spec.ts` always plays both participants as Vex — Rin's abilities (including Vital Siphon,
  Scope E4) are never exercised by the e2e suite, so that suite's outcome is not a signal either way for
  Scope E4; rely on the new/updated Jest coverage instead.

---

### Scope A (server, `packages/server/src/model/MatchModel.ts`) — skillshots must not hit behind the aim

Add a forward-facing check alongside the existing range/perpendicular/LOS gates in the
`DAMAGE`/`CROWD_CONTROL` branch: the opponent must be on the same side as the aim direction, not merely
colinear with the infinite line through it. Standard dot-product test —
`const forwardDot = ox * dirX + oy * dirY; if (forwardDot < 0) return;` — placed alongside the existing
`perpendicularDistance` check (both derived from the same `ox`/`oy`/`dirX`/`dirY` already in scope, no new
inputs needed). New test in `MatchModel.test.ts`: opponent positioned exactly opposite the click direction
(same perpendicular alignment, negative dot product) — currently would incorrectly hit; must now miss
(health unchanged, cost still consumed). Confirm every existing `submitAbility` test still passes — all of
them aim directly at the opponent's own position, which is always forward-facing by construction, so none
should be affected.

---

### Scope B (client, `MatchHUDView.tsx`) — cast-effect visuals must respect `ability.range`

Clamp the visual travel distance before it reaches `spawnCastEffect`, for **this player's own casts only**
(the opponent's casts already fall back to animating toward `target.position` when no aim info is
available, which is already range-correct by construction — see the existing `recordedAim` branch).
Concretely, wherever `lastAimPointRef.current.get(ability.id)` is read to build the projectile's `to`
point:
- For `DAMAGE`/`CROWD_CONTROL`: clamp the recorded aim point to at most `ability.range` game-units from
  the caster's position, along the same direction — i.e. `min(rawClickDistance, ability.range)` scaled
  along the aim's unit vector, mirroring the same normalize-then-scale shape `submitAbility` itself uses
  server-side (no need to import server code — the same three-line vector math, done client-side, purely
  for the visual).
- For `POSITIONING`: use exactly `ability.range` in the aim direction (not `min(...)`) — this matches
  what the server *always* actually does (`caster.position + direction * ability.range`, per Scope
  "Why this exists" above), which is a better visual approximation of the real outcome than the raw click
  distance ever was. (It can still slightly overshoot the *true* wall-clamped/obstacle-blocked outcome,
  since the client doesn't know that in advance — acceptable; the next real tick snapshot is still what
  actually moves the marker, this only affects the transient travel animation.)
- HEAL's self-pulse (`kind: 'pulse'`) has no travel distance concept and is unaffected by this scope —
  except see Scope E4, which turns Vital Siphon into a `'projectile'`-kind cast for a different reason.

New test in `MatchHUDScreen.test.tsx`: a short-range ability (Crushing Blow, range 75) aimed/clicked far
across the arena — assert the resulting `.cast-effect--projectile`'s `--dx`/`--dy` magnitude corresponds
to at most 75 game-units of travel (converted to the test's known render scale), not the full click
distance. Confirm the existing `'CRITICAL CHECKPOINT: my own DAMAGE skillshot spawns a projectile toward
my recorded aim point...'` test (Arcane Bolt, range 600, clicked at the arena's center — well within
range) still passes unmodified, since that click was already within range.

---

### Scope C (client) — per-ability projectile travel speed

Replace the single fixed `CAST_EFFECT_DURATION_MS = 500` for projectile-kind casts with a computed
duration derived from the (now range-clamped, Scope B) travel distance and a per-ability or per-effect-type
speed constant — e.g. a `PROJECTILE_SPEED_PX_PER_MS` baseline, with faster/slower multipliers for specific
abilities that clearly call for it by flavor (Arcane Bolt: "signature burst," reads as fast; Crushing Blow:
a heavy "overhead strike," reads as slower per-unit-distance even though its short range means it still
resolves quickly in absolute terms). Clamp the computed duration to a sane `[MIN_MS, MAX_MS]` range so a
very short hit never looks instant (jarring, unreadable) and a very long one never feels sluggish or
desyncs badly from the fixed-position damage-popup/cooldown-chip updates that already happen on the same
tick. This needs the CSS `animation-duration` (or `--travel-duration`) to become a per-cast inline value
(a new CSS custom property, e.g. `--travel-ms`, set alongside the existing `--dx`/--dy`) rather than the
current flat `0.5s` in `.cast-effect--projectile`'s rule — the `cast-travel` keyframe itself (its
from/to transform/opacity shape) does not need to change, only what drives its duration. Also update the
JS-side `spawnCastEffect` cleanup `setTimeout` to use the same computed duration (not the old fixed
constant) so the effect is removed from state exactly when its animation finishes, not early/late.
HEAL's self-pulse keeps the fixed `0.5s` (no travel distance to derive a speed from) unless you find a
tasteful reason to vary it too — optional, not required.

New test: two same-`from`/different-`to` casts (e.g. a short-range hit vs. a long-range hit, both
`isMine`) resolve with measurably different computed durations, proving speed genuinely varies with
distance/ability rather than being a cosmetic no-op.

---

### Scope D (client) — per-ability skillshot shapes

Extend the cast-effect projectile's shape/color beyond the four `EffectType`-level modifiers `11_client_8`
already added (`cast-effect--damage`/`--heal`/`--cc`/`--positioning`) to vary per `ability.id` too,
mirroring the exact pattern `AbilityIcon`/`ABILITY_ICON_GLYPHS` already established for the static button
icons — a `CastEffectVisual` gains an `abilityId: string` field (alongside its existing `effectType`),
and the projectile's rendered `<div>` gains an additive `cast-effect--{abilityId}` class (or, if you
prefer inline styling over a fixed set of new CSS classes for ten values, an equivalent per-ability
lookup for shape/size) layered on top of — not replacing — the existing `EffectType`-level modifier.
Match each ability's shape to its own already-written flavor where it's an easy, obvious fit (e.g.
Crushing Blow: larger/blunter than Rending Strike's thin fast slash, even though both are `--damage`;
Shockwave Slam: a wider/rounder shape than Frost Lance's narrow shard, even though both are `--cc`); don't
force a contrived distinction where the effect-type-level shape already reads fine — ten *meaningfully*
distinct shapes is the goal, not ten *arbitrarily* distinct ones. Keep this additive and reversible: if a
given ability's shape ends up indistinguishable from its effect-type default in practice, that's an
acceptable outcome for that one ability, not a blocking failure.

New test: same pattern as `11_client_8`'s per-ability-icon test — render two different abilities sharing
an `EffectType` (e.g. Crushing Blow vs. Rending Strike, both `DAMAGE`) through a real cast, and assert
their `.cast-effect--projectile` elements carry different additive classes (or different computed
shape-driving inline styles).

---

### Scope E (shared/server) — four flavor-grounded unique mechanics

The other six abilities (Crushing Blow, Arcane Bolt, Rending Strike — differentiated by number alone,
matching `ChampionRoster.ts`'s own documented design intent for the DAMAGE trio; Frost Lance and Iron Skin
— left as the "plain" baseline each new mechanic below is deliberately contrasted against) are **not** in
scope here — don't invent mechanics for abilities whose existing flavor doesn't call for one. These four
do:

**E1. Shockwave Slam** ("Slams the ground in a short-range shockwave, staggering anyone caught in its
**arc**") — currently uses the exact same `SKILLSHOT_HIT_RADIUS` (40 units) aim-alignment tolerance as
every point-and-click ability, despite its own description explicitly being an area effect, not a
precision hit. Give it a wider hit-alignment radius than the shared default — a locally-scoped constant
in `MatchModel.ts` (e.g. `SHOCKWAVE_SLAM_HIT_RADIUS`), checked via `ability.id === 'shockwave-slam'`
specifically rather than adding a new field to the shared `Ability` domain class (this project's own
"don't design for hypothetical future requirements" discipline — one ability needs this today; a general
per-ability hit-radius field touching all ten `Ability` constructions across `ChampionRoster.ts` and every
test fixture is a bigger, unjustified change for a one-off need). Pick a concrete starting value wider
than 40 (e.g. 90) and say so in the PR — like `SKILLSHOT_HIT_RADIUS` itself, this is "a tunable balance
number... adjust based on how it actually feels to play, not from first principles" (`Arena.ts`'s own
words). New test: an opponent positioned within the wider radius but outside the default 40 — misses under
the old shared constant, hits under Shockwave Slam's own.

**E2. Bulwark Charge** ("A shoulder-first charge that closes distance fast, **shield raised**") — currently
a pure self-reposition with zero interaction with the opponent, even if the charge's path runs straight
through them. Add a short crowd-control stagger (via the already-existing `applyCrowdControl(durationMs,
now)` — no new mechanism needed) to the opponent if the charge's travel segment (caster's pre-cast position
→ its final wall/obstacle-clamped destination) passes within a small radius of the opponent's current
position — a point-to-segment distance check (standard clamped vector projection; there's no existing
helper for this in `Arena.ts`, a small new one is warranted here, unlike E1's one-off constant, since
"closest point on a segment to a point" is a genuinely reusable primitive, not an ability-specific
constant). Reasonable starting numbers: reuse `SKILLSHOT_HIT_RADIUS` (40) as the collision radius, a short
stagger duration (e.g. 0.5-1s) — both tunable, say your final choice and reasoning in the PR. This must not
change anything about how/whether the charge itself resolves (range, wall-clamp, obstacle-blocks-the-whole-
cast) — it's a pure addition layered on top of the existing POSITIONING branch.

**E3. Phase Step** ("A short **blink through the space between spaces**, putting distance between Vex and
danger") — currently blocked by `segmentCrossesObstacle` exactly like the other two POSITIONING abilities,
despite its own flavor being explicitly a teleport past physical space, not a physical dash/charge like
Bulwark Charge or Swift Reposition. Exempt it specifically (`ability.id === 'phase-step'`) from the
obstacle line-check in the `POSITIONING` branch — it still wall-clamps to the arena bounds (that's a hard
world boundary, not an "obstacle" in the same sense), but a pillar/block in its path no longer rejects the
cast. New test: a Phase Step aimed straight through an `ARENA_OBSTACLES` rectangle succeeds (caster
relocates to the far side); confirm the existing Bulwark Charge/Swift Reposition-style obstacle-blocks-the-
cast test (currently written against the fixture's generic `blink` ability) still passes for a *non*-
Phase-Step positioning ability.

**E4. Vital Siphon** ("**Draws vitality through** a melee strike, mending Rin's own wounds") — the single
clearest case in the whole roster: despite very different names/flavor, Vital Siphon and Iron Skin
currently resolve through byte-for-byte identical code (`caster.applyHeal(ability.magnitude)`, no target,
no aim). Telling piece of evidence this was never actually intended: **Vital Siphon's own `range` field is
already `100`** in `ChampionRoster.ts` — nonzero, unlike Iron Skin's `range: 0` — but nothing currently
reads it, since every `HEAL` ability is unconditionally treated as instant/self-targeted regardless of its
`range`. Change `submitAbility` so a `HEAL` ability's resolution branches on `ability.range`: `range === 0`
keeps today's exact behavior (instant, self-targeted, no aim — covers Iron Skin only); `range > 0` requires
`req.targetPosition` and resolves through the **same** range/forward-facing/perpendicular/LOS gates
already used for `DAMAGE`/`CROWD_CONTROL` (Scope A included), and on a hit applies **both**
`opponent.applyDamage(ability.magnitude)` **and** `caster.applyHeal(ability.magnitude)` — a real siphon,
not a plain heal. A miss (out of range/misaimed/blocked) applies neither, cost still consumed, matching
every other skillshot's whiff behavior.

**This is the largest, most consequential single change in this prompt — read the rest of this item
fully before touching it.** It changes Vital Siphon from a no-aim instant cast to an aimed skillshot, which
cascades into the client:
- `isSkillshotType` (currently `(effectType: EffectType) => effectType !== EffectType.HEAL`) needs to
  become range-aware, not just effect-type-aware — e.g. take the whole `ability` and return
  `ability.effectType !== EffectType.HEAL || ability.range > 0`. Every call site currently passing
  `ability.effectType` needs to pass `ability` instead (the click handler, the hotkey handler, the
  ability-button `onClick`, the range-ring visibility check).
- The existing out-of-range button styling (currently gated by an `isOffensive` check —
  `effectType === DAMAGE || effectType === CROWD_CONTROL`) should extend to cover Vital Siphon too, since
  it now genuinely requires the opponent to be in range — same `ability.range > 0`-style condition is a
  reasonable single signal to reuse for both purposes rather than maintaining two separately-drifting
  ability classifications.
- **Two existing `MatchHUDScreen.test.tsx` tests must be deliberately rewritten, not silently left broken
  or silently deleted** — name them explicitly in your commit/PR, matching this project's established
  practice for correction commits (`11_client_5`, `10_client_5`/`6`, etc.):
  1. `'clicking a self-targeted HEAL ability forwards useAbility immediately, with no target and no
     aiming'` — uses Rin, clicks "Vital Siphon", asserts an immediate no-target cast. This is exactly the
     behavior being intentionally changed; either repoint this specific test at Iron Skin (Korr — genuinely
     still instant/self-targeted/no-aim, the only real remaining example) and add a *new* test asserting
     Vital Siphon now enters aim mode instead (mirroring the existing `'clicking a DAMAGE ability does not
     cast immediately — it enters aim mode'` test's shape), or rewrite this test in place to assert the new
     aimed behavior for Vital Siphon specifically — your call, but the old assertion must not silently keep
     passing against stale reasoning.
  2. `'pressing the hotkey for a HEAL ability casts immediately, same as clicking it'` — same issue, same
     fix, for hotkey `'2'` (Rin's Vital Siphon).
- New test coverage needed either way: Vital Siphon lands (opponent takes damage AND caster heals) when
  aimed correctly within range; Vital Siphon whiffs (neither effect applies, cost still consumed) when
  out of range/misaimed/blocked; Iron Skin's existing instant/self-targeted test(s) still pass unmodified,
  proving `range === 0` truly preserves old behavior for the one ability that should keep it.

---

### Process
1. Read the real current `MatchModel.ts`, `MatchModel.test.ts`, `ParticipantState.ts`, `Arena.ts`,
   `MatchHUDView.tsx`, `MatchHUDScreen.test.tsx`, and `styles.css` in full before writing anything — this
   prompt was written against a specific snapshot of all of them; confirm nothing has drifted.
2. Scope A first (small, self-contained, and every later scope's tests build on correct aim resolution).
3. Scopes B/C/D (client-visual) and Scope E (server-mechanics) are otherwise independent of each other —
   any order — except E4's client cascade obviously depends on E4's server change landing first.
4. New/updated tests as you go (see each scope above for what's required) — run the *full* `MatchModel.test.ts`
   and `MatchHUDScreen.test.tsx`/`MatchHUDView.test.ts` suites after each scope, not just once at the end,
   so a regression is caught next to the change that caused it.
5. Full `packages/server` and `packages/client` Jest suites, `npm run typecheck --workspaces`, real coverage
   numbers.
6. Playwright e2e suite twice in a row, cold (`docker compose -f docker-compose.test.yml down -v` first) —
   per "CRITICAL: preserve" above, this suite never exercises Rin/Vital Siphon, but it's still the real
   backstop for Vex's DAMAGE/CROWD_CONTROL/POSITIONING abilities (which Scope A's forward-facing check and
   Scope E1/E3 touch) and the whole client input pipeline Scope E4 restructures.
7. Load the app in a real browser and play at least one real match using Rin (to exercise Vital Siphon's
   new aim-then-click flow end to end) and at least one ability from each of the other two champions.
   Confirm: a short-range ability's projectile visually stops well short of a far-away click; a long-range
   ability still reads as fast/far; Vital Siphon now requires aiming and, on a real hit against a live
   opponent, both damages them and heals the caster. Describe what you observed in the PR — this prompt
   changes real gameplay feel, not just internals; "the tests pass" alone doesn't confirm it feels right.
8. Update `docs/01_class_list.md` with a correction note under §5a (`MatchModel`) covering: the forward-
   facing aim fix, the four ability-specific special cases (naming each by `ability.id`, matching how
   `docs/01_class_list.md` already documents other real corrections), and the Vital Siphon `range`-based
   HEAL branching. Keep it to what's genuinely load-bearing for a future reader, not a restatement of this
   whole prompt.

---

### Verification and Git
Report real `npm run typecheck --workspaces` output, full Jest output (with coverage) for both
`packages/server` and `packages/client`, two full cold-start Playwright e2e runs, and what you actually
observed playing a real match (Process step 7). Branch from `main` (check `git log` for divergence first),
commit message(s) describing what changed and why — multiple focused commits (e.g. one per scope) are fine
and arguably clearer than one giant commit here, given how much ground this prompt covers — push, open a PR
into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Scope E4 (Vital Siphon) deliberately breaks two currently-passing tests as a direct,
understood consequence of a real design correction — this is expected and required, not a mistake to
paper over. Do not leave both the old assertion AND a new contradictory one both "passing" via some
accidental branch coverage; make sure the old instant-cast behavior for Vital Siphon is genuinely gone
end-to-end (server no longer accepts a no-`targetPosition` cast for it as a no-op success) before calling
this done. Every other scope in this prompt must NOT break any existing test — if something outside E4
breaks, that's a real regression to fix, not a test to update.**
