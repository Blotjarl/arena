# Prompt 11_client_4 — Ability feedback, range indication, hotkeys, and a bigger arena

**Owner: Raj.** Load `prompts/00_master_context.md` first.

### CRITICAL prerequisite
`11_client_3_arena-visuals-and-wasd-input.md` must already be merged — this prompt builds directly on its
`toRenderPixels()` scaling helper and `ARENA_RENDER_SIZE_PX` constant.

### CRITICAL: what's actually wrong, from manually playing a real match
Real play surfaced a genuine usability gap, not a functional bug: `MatchModel.submitAbility` correctly
validates range server-side and **silently ignores** an out-of-range attempt (R4.2 — this is deliberate,
documented behavior, not something to change). But the client shows **zero** indication of an ability's
range, before or after clicking — so an out-of-range click looks *exactly* like a broken button. Combined
with abilities having no cast animation and no icon (plain text buttons only), the net effect reported was
"unsure what the abilities are accomplishing" and "clicks don't register." **The fix is entirely
client-side** — the server's authoritative silent-ignore behavior is correct and does not change; the
client just needs to surface information it already has access to (`Ability.range`, both participants'
positions) instead of leaving the player to guess.

Also: the arena has been resized once already (`11_client_3`, 400→700px) and still reads as too small
relative to the screen — real play shows a large fixed-size box surrounded by mostly-empty viewport.

### CRITICAL: same hard constraint as every client visual prompt before this
Every `aria-label` and button/heading string this project's e2e suite depends on (see `11_client_2`'s
prompt for the full compiled list, still accurate) must stay untouched. Ability buttons specifically:
`getByRole('button', { name: 'Arcane Bolt' })` (and every other ability's real name) must keep working —
add icons/styling/range-dimming around the text, don't replace the accessible name.

---

### Scope

**1. Range indication.** For `DAMAGE`/`CROWD_CONTROL` abilities (the ones already targeted at the
opponent, per `11_shared_4`'s targeting fix) — not `HEAL`/`POSITIONING`, which are self-targeted and have
no meaningful "range to opponent" — compute whether the opponent is currently in range:
`myPosition.distanceTo(opponentPosition) <= ability.range` (`getInterpolatedPosition()` already returns a
real `Position` instance with a working `.distanceTo()` — confirmed by reading `InterpolationBuffer.ts`).
Give an out-of-range ability button a distinct visual treatment from the existing on-cooldown dimming (a
player should be able to tell "too far away" apart from "still recharging" at a glance — don't reuse the
exact same style for both). Additionally, show a range ring — a translucent circle centered on your own
marker, radius scaled the same way positions already are (`(ability.range / ARENA_WIDTH) *
ARENA_RENDER_SIZE_PX`) — when hovering (or focusing, for keyboard users) an ability button, so a player can
see reach before committing to a click.

**2. Simple ability icons.** This project has no image-generation tooling and no reason to add binary
assets — build small inline-SVG glyphs (same technique as `11_client_3`'s pixel sprites, or a simpler
vector shape, your call) distinguishing effect type at a glance: something sword/impact-like for `DAMAGE`,
a cross/plus or heart-like shape for `HEAL`, a chain or burst shape for `CROWD_CONTROL`, an arrow/dash for
`POSITIONING`. Four shapes, reused across all three champions' kits (a `DAMAGE` icon looks the same on
every champion's damage ability) — this is about effect-type legibility, not per-ability uniqueness.

**3. Cast feedback.** When an ability is actually used (detect this the same way you'd detect any other
authoritative state change — a new `match:state` tick where a cooldown for that ability just started, or
similar; use your judgment on the cleanest signal available from `ClientMatchModel`/the snapshot data,
and don't invent a new server event for this, the existing tick data is sufficient): a brief animation
communicating "something happened" — a traveling projectile/line from caster to target for
`DAMAGE`/`CROWD_CONTROL`, a self-pulse for `HEAL`/`POSITIONING`. **Also add a floating damage-number
popup**: when a participant's `health` decreases between two snapshots, spawn a brief "-N" popup near
their marker that fades/rises and removes itself (a `setTimeout`-cleared local component state array of
active popups is a reasonable approach — clean up on unmount like every other timer in this project).

**4. Number-key hotkeys 1-4.** Map keys `1`/`2`/`3`/`4` to the champion's four ability slots, in the same
order they're already rendered, dispatching the exact same `controller.operation('useAbility', ...)` call
the ability buttons already make (including the existing DAMAGE/CROWD_CONTROL opponent-targeting logic) —
reuse it, don't reimplement it. Follow `11_client_3`'s WASD `useEffect`/cleanup pattern exactly (scoped to
`MatchHUDScreen`'s lifetime, listeners removed on unmount) — this is a single-press action (unlike
hold-to-move), so no repeat-interval is needed, just a `keydown` dispatch per press.

**5. A genuinely bigger, more immersive arena.** Rather than another fixed pixel bump, make the arena's
rendered size responsive to the viewport (e.g. something like `min(85vw, 85vh, 900px)` — exact values are
your judgment) so it actually dominates the screen rather than sitting in a box surrounded by empty black
space, the way the current 700px fixed size does on a normal desktop viewport. Reconsider the surrounding
Match HUD layout if a purely bigger arena would push other elements (HUD panels, ability bar) off-screen or
cramped — you have real latitude here on layout, the goal is "the arena reads as the main event," not a
specific pixel number.

### Process
1. Read the current `MatchHUDView.tsx`/`MatchHUDScreen` and `styles.css` in full — this file has changed
   twice already in Step 11; read the real current version, not any prior prompt's diff.
2. Build range indication first (smallest, most directly addresses the reported usability gap), then
   icons, then cast feedback, then hotkeys, then the arena resize (layout changes are easiest to verify
   once everything else is in place).
3. After each piece, run the client's existing `MatchHUDView`/`MatchHUDScreen` Jest tests.
4. Full client Jest suite, then the full Playwright e2e suite (`npm run test:e2e`), twice in a row from a
   cold `docker compose -f docker-compose.test.yml down -v` — the same standard every prompt touching this
   file has held to.
5. Load the app in a real browser and actually play a match — confirm range dimming/ring, icons, cast
   animations, damage popups, and 1-4 hotkeys all work, and that an out-of-range click now visibly
   communicates *why* nothing happened instead of just doing nothing. Describe what you see in your PR
   description.

---

### Verification and Git
Report the real output of the full client Jest suite and the full Playwright e2e suite (both full runs).
Branch `client` from `main` (check `git log` for divergence first — pull before you start), commit `Step
11: ability range/cast feedback, icons, number-key hotkeys, larger responsive arena`, push, open a PR into
`main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: manually attempt an out-of-range ability click through the real UI and confirm it's now
genuinely clear to a player why nothing happened — that experience (a click that silently does nothing) is
the actual bug report this prompt exists to fix. If it's still ambiguous after your changes, the prompt
isn't done yet.**
