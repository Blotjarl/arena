# Prompt 11_server_2 — Arena walls and distinct spawn positions (real gameplay gap, not cosmetic)

**Owner: Marshall.** Load `prompts/00_master_context.md` first.

### CRITICAL: two real, confirmed gaps found by manually playing a real match
1. **There is no arena boundary at all.** `ParticipantState.move()` is `this.position.x + direction.dx *
   speed * deltaSeconds` with zero clamping — confirmed by reading the method directly. A player can move
   infinitely in any direction; nothing stops them from leaving whatever visual arena the client draws.
2. **Both participants spawn at the exact same position**, `Position(0, 0)` — confirmed in
   `MatchModel`'s constructor via `ParticipantState`'s own default. This is why a real match's Match HUD
   showed both players' markers stacked in the same corner rather than starting apart.

This prompt fixes both, in `packages/shared` (a new arena-size constant, shared by the server's clamping
logic and the client's rendering) and `packages/server` (the clamp itself, plus distinct spawn positions).
**`11_client_3_arena-visuals-and-wasd-input.md` depends on this prompt merging first** — it needs the real
exported constant to scale the arena's visual rendering correctly, not a guessed number.

---

### Design
1. **New shared constants** — `ARENA_WIDTH`/`ARENA_HEIGHT` (both `400` is a reasonable choice, matching
   the coordinate range this project's movement speeds/ability ranges were already implicitly tuned
   against — Vex's `moveSpeed: 220` and Arcane Bolt's `range: 600` were designed assuming roughly this
   scale; don't change the *game-logic* coordinate space, only how large it's rendered — that's the
   client prompt's job, not this one). Put them wherever reads best in `packages/shared/src/domain` and
   export them from the package's `index.ts` the same way every other shared constant/type is.
2. **`ParticipantState.move()`**: clamp the resulting position to `[0, ARENA_WIDTH]` × `[0, ARENA_HEIGHT]`
   after applying the existing speed/deltaSeconds math — don't change the math itself, just cap the result
   (`Math.max(0, Math.min(ARENA_WIDTH, newX))`, same idea for `y`). A player pushing against a wall should
   stop exactly at it, not bounce or get rejected — this is normal movement, not an invalid action.
3. **Distinct spawn positions**: `MatchModel`'s constructor currently gives both `ParticipantState`s
   whatever `ParticipantState`'s own constructor defaults to (`Position(0, 0)` for both). Give the two
   participants separate starting positions on opposite sides of the arena, with reasonable margin from
   the walls you just added — exact values are your judgment call, but they should be visibly distinct and
   not immediately adjacent.

### TDD process
1. Read `ParticipantState.ts` and `MatchModel.ts`'s constructor in full — real current code, not this
   prompt's paraphrase.
2. Write tests first: repeated movement toward a wall stops exactly at the boundary, not beyond it (test
   all four directions, not just one); a single movement well within bounds is completely unaffected by
   the new clamp (no behavior change for normal play); the two participants' spawn positions are distinct.
3. Implement, run `npm run typecheck -w @arena/shared -w @arena/server` and the full test suites for both
   packages until green. Report real coverage numbers.
4. Add correction notes to `docs/01_class_list.md` for the new shared constants and the changed spawn/move
   behavior, matching this project's established format.

---

### Verification and Git
Report real `npm run typecheck` and `npx jest --coverage` output for both `packages/shared` and
`packages/server`. Branch `server` from `main` (check `git log` for divergence first), commit `Step 11:
arena wall boundaries and distinct spawn positions`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: do not change `ARENA_WIDTH`/`ARENA_HEIGHT`'s values casually — every existing champion's
`moveSpeed` and every ability's `range` in `ChampionRoster` was balanced against roughly a 400-unit space.
If you have a real reason to use a different number, explicitly re-check that Vex's Arcane Bolt (range
600) still reaches across the arena's diagonal, and that a full-speed sprint across the arena still takes
a reasonable few seconds, not an instant or a minute — state your reasoning in the PR description either
way.**
