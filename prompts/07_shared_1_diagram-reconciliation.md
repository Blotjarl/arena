# Prompt 07_shared_1 — Step 7: Reconcile class diagram and docs against the real code

**Owner: Marshall.** Load `prompts/00_master_context.md` first.

### CRITICAL: this is `docs/ProjectProcess.txt` Step 7, verbatim
> "Analyze the consistent class diagram and javadoc docs and make changes to the code if necessary.
> Iterate steps 4,5,6,7 until satisfied with your initial model."

Steps 9 and 10 (all `packages/` implementation) are now fully complete and merged across all four tracks.
`docs/01_class_list.md` (Step 1's model) and `docs/06_class_diagram_reverse-engineered.html` (Step 6's
deterministic reverse-engineering of the code) have **not** been systematically re-checked against that
finished code. This prompt is that check. **Treat the current, tested, merged code as ground truth** — the
working code has already been implemented, tested, and reviewed; your job is to bring the *documentation*
into alignment with it, not the reverse. If you find a case where you believe the *code* itself is actually
wrong (not just undocumented), **do not fix it in this prompt** — stop, note it clearly in your final
summary instead, since a real code change needs its own TDD-validated prompt, not a docs-reconciliation
pass. This prompt touches `docs/` only, never `packages/`.

---

### One known drift, already found — fix this one for certain, then look for more
`docs/01_class_list.md`'s `MatchRepository` row (around line 262, in the `packages/api` §7a table) still
documents `findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchParticipant[]>`.
The real, current implementation in `packages/api/src/model/MatchRepository.ts` returns
`Promise<MatchHistoryRow[]>` instead — a richer shape (`opponentUsername`, `endReason`, `durationMs`,
`endedAt`, no `team`) built via a self-join, added during the "opponent-join correction" (commit
`f32472d`). Update the table row to match, and add a **Step 10 correction** note in the same style as the
three that already exist in this file (search for "Step 10 correction" and "Step 9 correction" to see the
established format) explaining why (`MatchParticipant` alone can't carry an opponent reference — see the
real doc comment on `MatchHistoryRow` in the source file for the actual reasoning to summarize).

### Process for the rest — a real systematic pass, not just the one item above
1. Regenerate the reverse-engineered diagram fresh against current code:
   `node scripts/generate-class-diagram.js docs/06_class_diagram_reverse-engineered.html` — confirm it
   runs clean (it should; this was verified to still work during the audit that produced this prompt).
2. Go track by track (`shared`, `server`, `client`, `api`) through `docs/01_class_list.md`'s per-package
   tables. For every class, compare its documented attributes/operations against the actual current
   source file. Pay particular attention to:
   - Method signatures that gained or lost parameters during Steps 9-10 (several already are documented
     as corrections — check each one is *actually* still accurate, not just present).
   - New classes that didn't exist at Step 1 (e.g. anything added as a "CORRECTION" during Step 9/10 that
     might not have made it into the class list's *tables*, only into a prose correction note — the
     `MatchReportingListener` class from `10_server_9`, if that prompt has been run and merged by the time
     you start this one, is a likely candidate to check for exactly this).
   - Relationships summary (§8) — do the associations/dependencies still hold given everything built in
     Steps 9-10, or has real code revealed a relationship the original design didn't anticipate?
3. For each drift found, fix `docs/01_class_list.md` directly (and add a correction note if it's a
   signature/behavior change, not just a typo) — do not batch silent fixes without a note if the change is
   non-trivial; a future reader needs to know *why* the doc changed, the same way the existing correction
   notes explain the ones already there.
4. Once `docs/01_class_list.md` is accurate, sanity-check `docs/06_class_diagram_reverse-engineered.html`
   (the file you regenerated in step 1) visually renders and its class list roughly matches — this is a
   spot-check, not a line-by-line audit, since the reverse-engineering script is deterministic and was
   already validated against TypeDoc's real output at Step 6.

---

### Verification and Git
List every drift you found and fixed in your final summary (not just "docs updated" — an actual list, the
way this prompt's own investigation produced one). Confirm `git status` shows only changes under `docs/`
and nothing under `packages/`. Commit directly to `main` (prompt/doc files don't need the branch/PR flow
real implementation code does — master context §9.4): `Step 7: reconcile class list and diagram against
Steps 9-10 implementation`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: if this pass finds evidence that the actual *code* (not just the docs) has a real bug or
SRS-requirement gap — the way `10_server_9`'s existence was discovered by exactly this kind of systematic
audit — stop and report it explicitly and prominently in your final summary rather than letting it blend
in with routine doc-typo fixes. That is the single most valuable thing this step can produce.**
