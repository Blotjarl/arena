# Prompt 11_server_3 — Widen the arena 1.5x and add real, server-authoritative obstacles

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.

### CRITICAL: obstacles must be server-authoritative, not a client-only visual
This whole project's central architectural rule (master context §1.1, SRS 2.1) is that the game server is
the sole source of truth for every match-critical outcome — the client renders, it never decides. An
obstacle a player can visually see but walk straight through would violate that as badly as trusting a
client-reported position would. **Define obstacles once, in `packages/shared`, and make the server's
`ParticipantState.move()` actually enforce them** — `11_client_6_render-wider-arena-and-obstacles.md`
(depends on this prompt) only renders what this prompt makes real.

### CRITICAL prerequisite for the dependent client prompt
`11_client_6` needs the real, exported obstacle data and the new `ARENA_WIDTH` value from this prompt —
don't let it start until this merges.

---

### Design

**1. Widen the arena.** `ARENA_WIDTH` (currently 400, in `packages/shared/src/domain/Arena.ts`) becomes
600 (1.5x) — leave `ARENA_HEIGHT` at 400; the request was specifically for a *wider* arena, not a bigger
square. This is the same class of change `11_server_2` already made once — re-verify the same things that
prompt checked: Vex's Arcane Bolt (range 600) against the new arena's diagonal (`√(600² + 400²) ≈ 721`) —
600 no longer reaches every corner-to-corner case, which is a reasonable, even welcome consequence of a
bigger space (state this explicitly in your PR rather than treating it as a problem to route around), and
recheck that a full-speed sprint across the new width is still a reasonable few seconds, not instant or a
full minute.

**2. Update spawn positions.** `MatchModel`'s constructor currently spawns at
`(SPAWN_WALL_MARGIN, ARENA_HEIGHT / 2)` and `(ARENA_WIDTH - SPAWN_WALL_MARGIN, ARENA_HEIGHT / 2)` — this
formula is already width-relative, so it should adapt automatically once `ARENA_WIDTH` changes; just verify
the two spawn points are still clearly distinct and don't land inside an obstacle (see below).

**3. Define obstacles as new shared, authoritative data.** Add a small, fixed list of static rectangular
obstacles — something like `ARENA_OBSTACLES: readonly { x: number; y: number; width: number; height: number }[]`
in `packages/shared` (same file as `ARENA_WIDTH`/`ARENA_HEIGHT`, or a new one — your call), exported the
same way. Keep this simple and contained for this round: 2–3 static rectangles, placed in the arena's
middle third (not near either spawn point, not spanning the full height/width — leave clear paths around
them), roughly mirrored left-right so neither spawn has a positional advantage. **Scope decision, stated
explicitly so it's not ambiguous**: obstacles block *movement* only, not ability range/targeting or line of
sight — `MatchModel.submitAbility`'s existing distance-based range check is unchanged by this prompt. If a
genuinely bigger "obstacles affect abilities too" feature is wanted later, that's a separate, later prompt,
not this one.

**4. Enforce obstacles in `ParticipantState.move()`.** After computing and clamping the new position (the
existing `11_server_2` wall-clamp logic), check whether that resulting position would fall inside any
`ARENA_OBSTACLES` rectangle. If so, **do not apply that movement** — leave the participant at their
pre-move position for this tick, the same way an out-of-bounds position is prevented rather than allowed
and corrected after the fact. A full axis-separated "slide along the wall" collision response (only reject
the specific axis that would collide, still allow the other) is a nice-to-have if you have time and it's
not much more complex than the simple reject-the-whole-move approach — your judgment, but don't let it
block finishing this prompt if it turns out to be a bigger rabbit hole than expected.

### TDD process
1. Read `Arena.ts`, `ParticipantState.move()`, and `MatchModel`'s constructor in full — real current code.
2. Write tests first: moving toward/into an obstacle stops before entering it (test more than one
   obstacle and more than one approach direction — don't just test the easy case); moving well clear of any
   obstacle is completely unaffected (no false-positive blocking); the two spawn positions remain distinct
   and neither falls inside an obstacle at the new arena width. Reuse the exact same rigor
   `11_server_2`'s wall-clamp tests already established (repeated movement well past where a wall/obstacle
   should stop it, not just a single step that happens to land short).
3. Implement, run `npm run typecheck -w @arena/shared -w @arena/server` and the full test suites for both
   packages until green. Report real coverage numbers.
4. Add correction notes to `docs/01_class_list.md` for the new `ARENA_WIDTH` value, the new
   `ARENA_OBSTACLES` export, and the changed `move()` behavior, matching this project's established format.

---

### Verification and Git
Report real `npm run typecheck` and `npx jest --coverage` output for both `packages/shared` and
`packages/server`. Branch `server` from `main` (check `git log` for divergence first), commit `Step 11:
widen arena to 1.5x and add server-authoritative obstacles`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: place obstacles where they matter — not so far from the center that they're never
encountered in normal play, not so close to a spawn that one player is immediately boxed in. If you're
unsure your placement is reasonable, describe your reasoning in the PR description rather than picking
arbitrary coordinates and moving on.**
