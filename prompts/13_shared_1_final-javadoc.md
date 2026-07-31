# Prompt 13_shared_1 — Final Javadoc (TypeDoc)

**Owner: the flagship agent (this chat), executed directly.** Load `prompts/00_master_context.md` first.
Implements `docs/ProjectProcess.txt` Step 13: "Create a final javadoc." Docs-only — no `packages/` changes.

### Why this is short
`03_shared_2_typedoc-generation.md` already installed and configured TypeDoc (`typedoc.json`,
`tsconfig.typedoc.json`, the `npm run docs` script) and generated the *initial* `docs/api/` — Step 5's own
words, "an initial pass... not a zero-warning site." Step 13 needs no new tooling, only a fresh run against
the final codebase: `docs/api/` has not actually been regenerated-and-committed since that Step 5 commit
(confirmed via `git log --oneline -- docs/api`), even though a great deal of real, documented code has
shipped since (the leaderboard system, the visual overhaul, the ability-uniqueness work, among others) — so
this is a genuine gap to close, not a formality.

### Process
1. Confirm `main` is current and `npm run typecheck --workspaces` passes.
2. Reset `docs/api/` to its last-committed state first (`git checkout -- docs/api && git clean -fd
   docs/api`) so the regeneration below is provably a clean, full run against current `main` — not layered
   on top of whatever partial/stale local state happened to already be sitting in the working tree.
3. Run `npm run docs`.
4. **MANDATORY checks**, same bar as Step 5's own:
   - Exit code 0, no `[error]` lines (individual undocumented-member warnings remain acceptable, same as
     Step 5 — this still isn't asking for a zero-warning site, just a complete, current one).
   - Spot-check `docs/api/classes/*.html` for real pages covering classes added since Step 5 across every
     package, not just `shared` — e.g. `client_src_view_ChampionSprite`,
     `client_src_controller_LeaderboardController`, `client_src_model_ClientLeaderboardModel`,
     `api_src_model_LeaderboardRepository`, `server_src_controller_MatchReportingListener`.
5. Commit the regenerated `docs/api/` — per Step 5's own already-made decision, this is generated output
   that's deliberately tracked in git (not gitignored), since the archive-based course submission has no
   build step of its own to regenerate it.

### Verification and Git
`npm run typecheck --workspaces` still passes. Commit `Step 13: final javadoc (regenerated docs/api)`,
push, open a PR into `main` — can be bundled with `12_shared_1_final-class-diagram.md`'s commit in the same
PR.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: verify the diff is plausible before committing — `docs/api/` should show real new pages for
real new classes/methods added since Step 5, and updated content for existing ones, not a suspiciously
small or suspiciously enormous diff. A near-empty diff after this much feature work landing would mean the
regeneration silently didn't pick up current source (stale `dist/`, wrong `tsconfig`, etc.); investigate
rather than committing a stale result.**
