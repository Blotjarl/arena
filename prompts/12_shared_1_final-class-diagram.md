# Prompt 12_shared_1 — Final Reverse-Engineered Class Diagram

**Owner: the flagship agent (this chat), executed directly.** Load `prompts/00_master_context.md` first.
Implements `docs/ProjectProcess.txt` Step 12: "Reverse engineer the code to produce a consistent UML class
diagram." Docs-only — no `packages/` changes.

### Why this is short
`06_shared_1_reverse-engineer-class-diagram.md` already built and validated
`scripts/generate-class-diagram.js` for exactly this purpose, and its own closing requirement is explicit:
*"written once, here, and reused unmodified for Step 12's final reverse-engineering pass... if Step 12 needs
different behavior, that means this script needs to change for both call sites, not that a second script
gets written."* Step 12 is therefore not new design work — it's re-running that same deterministic
generator against the codebase in its current, final state (Step 9-11's model/controller/view work and all
of Step 11's acceptance-testing/polish rounds, none of which existed yet when Step 6 first ran this script),
and keeping the result as a separate, permanent artifact alongside Step 6's — the whole point of Step 7
("reconcile class diagram and docs against the real code") was comparing an early snapshot against Step
1's plan; Step 12's output is the final snapshot the submission itself will actually be graded against, and
both should remain in the archive side by side rather than one overwriting the other.

### Process
1. Confirm `main` is current (`git log --oneline -5`) and `npm run typecheck --workspaces` passes — the
   generator runs `npx typedoc --json` under the hood, so it needs a codebase that actually compiles.
2. Run `node scripts/generate-class-diagram.js docs/12_class_diagram_final.html "Step 12 — Final"` — the
   script's own CLI already accepted an output-path override (`process.argv[2]`, defaulting to the Step 6
   filename), so giving Step 12 its own distinct output file needed no script change. **Real gap found
   while doing this**: the page's own `<title>`/`<h1>` text was a hardcoded literal, `"Step 6"`, regardless
   of output path — regenerating into `docs/12_class_diagram_final.html` produced a page that correctly
   contained the current, final class structure but *said* "Step 6" at the top, which would be a genuinely
   confusing/incorrect-looking submission artifact. Fixed per this script's own closing requirement ("if
   Step 12 needs different behavior, that means this script needs to change for both call sites, not that a
   second script gets written"): added a third, optional CLI arg (`process.argv[3]`, a step label) used in
   the title/heading only — never in diagram content — defaulting to `'Step 6'` so the original zero-arg
   invocation keeps producing byte-for-byte the same output it always has (verified directly: re-ran the
   default invocation and confirmed the only diff against the committed Step 6 file was new classes added
   to the codebase since, not a title/heading change, before discarding that regeneration so Step 6's own
   committed snapshot stays exactly as it was).
3. **MANDATORY checks**, same bar as Step 6's own:
   - Exit code 0; reported file size in the low single-digit MB.
   - Open `docs/12_class_diagram_final.html` in a real browser and confirm the diagrams render as actual
     boxes/arrows, not raw `classDiagram ...` text.
   - All six sections present (shared MVC, shared domain, shared exceptions, server, client, api) and
     visibly larger/more populated than Step 6's snapshot — real new classes exist now that didn't at Step
     6 (e.g. `LeaderboardController`/`LeaderboardView`/`ClientLeaderboardModel`,
     `LeaderboardEntry`/`LeaderboardRepository`, `MatchReportingListener`), so an unchanged-looking diagram
     would mean something's wrong, not that nothing changed. `ChampionSprite` (`11_client_8`) is a plain
     function component, not a class — correctly absent here, same as every other `*Screen`/function
     component has always been out of this diagram's scope since Step 1.
   - `git status` shows no changes under `packages/` (the generator only reads source) and no leftover
     `.typedoc-model.json` at the repo root.
4. Add a convenience script to root `package.json`, alongside the existing `diagram:reverse-engineer`:
   ```json
   "diagram:final": "node scripts/generate-class-diagram.js docs/12_class_diagram_final.html \"Step 12 — Final\""
   ```

### Verification and Git
`npm run typecheck --workspaces` still passes (this prompt can't break it, but confirm). Commit
`Step 12: final reverse-engineered class diagram`, push, open a PR into `main` — can be bundled with
`13_shared_1_final-javadoc.md`'s commit in the same PR since both are docs-only wrap-up steps with no
interaction between them.
