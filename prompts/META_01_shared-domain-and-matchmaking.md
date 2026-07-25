# Meta-Prompt 01 — Generate: Shared Domain Data + MatchmakingQueue

**Your job in this session is to WRITE PROMPT FILES, not implement application code directly.** You are
generating `09_shared_1_domain-value-objects.md` and `09_server_1_matchmaking-queue.md` — two Step 9
prompts that a *different* session will later execute for real.

---

### CRITICAL: read these three things in full before writing anything
1. `prompts/00_master_context.md` — project-wide conventions.
2. `prompts/09-10_implementation_plan.md` — the spec this whole batch of work follows; §5 specifically
   addresses your scope (champion balance numbers).
3. `prompts/09_server_2_participant-state.md` — this is your **quality and format bar**. Every prompt you
   write must match its level of rigor: exact current stub transcribed verbatim, a complete real
   implementation, a complete test file, a verification section with real measured numbers (not estimates),
   and the standard git-workflow closing. Do not write a lighter-weight prompt than this example.

---

### Your process, for each of the two prompts you're producing
1. Read the actual current stub file in `packages/` — the real code is ground truth, not any doc summary.
2. Design and implement the real logic, TDD: write tests first, implement, run `npm run typecheck` and
   `npx jest <file> --coverage --collectCoverageFrom=...` until green.
3. Report the real coverage numbers you measured.
4. **Once verified, revert** — `git checkout -- <file>` on the implementation file, delete your test file
   from the working tree. The validated code goes *into* the prompt file, not into a direct commit. Confirm
   `git status` shows no changes under `packages/` before moving on.
5. Write the prompt `.md` file embedding your validated code + test file + real verification numbers.

---

### 1. `09_shared_1_domain-value-objects.md`
**Scope**: `Position.distanceTo`, `Champion.getAbility`, `ChampionRoster.getAll`/`getById`.

`Position.distanceTo` is trivial (Euclidean distance — `Math.hypot(this.x - other.x, this.y - other.y)`).

`ChampionRoster` is the real content-generation work here: **you are inventing concrete numbers** for
Korr, Vex, Rin's abilities (cooldowns, resource costs, ranges, magnitudes) — SRS Appendix B only names the
abilities, it doesn't give numbers, and none exist anywhere in this codebase yet. Per the implementation
plan §5: keep them simple and round; internal consistency matters more than precision (a tankier champion
should have slower/cheaper abilities than a burst mage; Korr is the 180-HP bruiser, Vex the 85-HP glass
cannon, Rin the 130-HP sustain duelist — their kits should read that way in the numbers). Each champion
needs at least one `DAMAGE` ability (no auto-attack exists — a kit with none could never win by
elimination, per SRS Appendix B's own note). Write out the full roster: Korr (Crushing Blow, Shockwave
Slam, Iron Skin, Bulwark Charge), Vex (Arcane Bolt, Frost Lance, Phase Step), Rin (Rending Strike, Vital
Siphon, Swift Reposition) — map each named ability to an `EffectType` (`DAMAGE`/`HEAL`/`CROWD_CONTROL`/
`POSITIONING`) based on its description and give it real numbers.

`Champion.getAbility(abilityId)` throws `InvalidChampionSelectionError` if not found — write that test too.

### 2. `09_server_1_matchmaking-queue.md`
**Scope**: `MatchmakingQueue.join`, `cancel`, `tryPairNext` (`size()` is already implemented — leave it).

This is a **CRITICAL CHECKPOINT** class (`prompts/00_master_context.md` §8, and
`prompts/09-10_implementation_plan.md` §2 item 1) — include a named test proving `tryPairNext()` cannot
double-pair the same player if called back-to-back, and a test proving the `maxConcurrentMatches` bound
(R2.5) is actually enforced (requests beyond the bound stay queued, in order). `join()` throws
`AlreadyQueuedError` if the player is already queued; `cancel()` throws `NotQueuedError` if they aren't
queued. `tryPairNext()` returns the two longest-waiting entries (FIFO, R2.4) or `null` if fewer than two
are queued or no match slot is free.

---

### Verification and Git (for this whole meta-prompt session, after both files are written)
Confirm `git status` shows only the two new `.md` files under `prompts/`, nothing under `packages/`.
Commit directly to `main` (prompt files are planning artifacts, not application code — they don't need the
branch-per-track/PR flow real implementation code does) with message `Add generated Step 9 prompts: shared
domain data, matchmaking queue`, push. Update `prompts/README.md`'s Step 9 table, adding both rows.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `09_shared_1` must be written and its branch reviewed/merged before anyone executes
`09_server_3` (`MatchModel`'s champion-selection increment) for real — that prompt calls
`ChampionRoster.getById()` and needs real champion data to exist. Flag this dependency clearly at the top
of `09_shared_1_domain-value-objects.md`, the same way the six example prompts flag their own prerequisites.**
