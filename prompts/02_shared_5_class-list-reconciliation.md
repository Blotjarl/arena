# Prompt 02_shared_5 — Class List Reconciliation (Post-Step-2 Audit Fix)

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`.** This prompt fixes three places where
`docs/01_class_list.md` fell out of sync with code from Step 2 that is **already correct** — no code
changes in this prompt, documentation only. This is MDD hygiene (master context §1.2): the model must
match the code, and right now it doesn't in three spots, all traceable to deviations the original Step 2
prompts flagged but that weren't propagated back into the class list.

---

### MANDATORY: Sandwich Requirement
- **Start**: `git diff` on this prompt's changes must touch only `docs/01_class_list.md` — if you find
  yourself editing anything under `packages/`, stop, the code is not what's wrong here.
- **End**: all three items below are corrected; `npm run typecheck --workspaces` still passes (it will,
  since nothing under `packages/` changes).

---

### 1. `SocketConnectionController` — remove the stale `extends AbstractController`

Current (§6b, client controller table): the row for `SocketConnectionController` says
`` `extends AbstractController` ``. This is wrong — `packages/client/src/controller/SocketConnectionController.ts`
is a plain class (verified), matching the same "transport adapter, not MVC" pattern already correctly
documented for `ConnectionHandler` (§5b). Change the "Extends" column for this row to:

```
*(not an `AbstractController` — a thin transport adapter coordinating three models, kept separate for the
same reason `ConnectionHandler` is on the server side — see §5b)*
```

### 2. API response views — remove the stale `View` implementation claim

Current (§7c): `LeaderboardResponseView`, `MatchHistoryResponseView`, and `ErrorResponseView` are each
listed as implementing `` `View` ``. This is wrong — all three are plain classes with a single `render()`
method (verified in `packages/api/src/view/*.ts`); a synchronous HTTP response has no push/observe
semantics for `getController()`/`setController()` to mean anything, unlike the server's broadcast views.
Change the "Implements" column for all three rows to `—`, and add one sentence after the table:

```
Unlike the server's broadcast views, these are plain formatter classes (a `render()` method only) — a
synchronous HTTP response has no push/observe relationship to establish, so implementing the full `View`
interface would be unused ceremony.
```

Also fix the relationships summary (§8, "Generalization / realization" bullet listing `View` implementers)
to drop "all three `api/view` classes" from that list.

### 3. Branded ID types — correct to match the actual (simpler) implementation

Current (§2, domain table): `` `PlayerId`, `MatchId`, `ChampionId` | branded `string` types (`ids.ts`) ``.
This was the Step 1 draft's intent, but the Step 2 prompt that actually built `ids.ts` deliberately chose
plain aliases instead (lower risk for a course project, branding added no enforced safety without also
using nominal-typing helper functions nobody asked for). The code — `export type PlayerId = string;` etc.
— is correct as shipped. Change the cell to:

```
plain `string` type aliases (`ids.ts`) — not branded; simplicity was chosen over nominal typing for Step 2
```

---

### 4. Optional, low-priority: note the broadcast views' N/A controller methods
`packages/server/src/view/MatchmakingBroadcastView.ts` and `MatchBroadcastView.ts` each have a code
comment "see class-list note below" that refers to a note which doesn't exist in `docs/01_class_list.md`
§5c. If time allows, add one sentence to §5c noting `getController()`/`setController()` are not applicable
on these two classes (pure observers, no paired controller) — this isn't required, the code is correct
either way, it just makes the referenced comment true.

---

### 5. Verification and Git
Confirm `git diff --stat` shows only `docs/01_class_list.md`. Per master context §9.4: branch `shared`
from `main`, commit `Docs: reconcile class list with Step 2 corrections (ids, SocketConnectionController,
api views)`, push, open a PR into `main`. Also update `prompts/README.md` — add this prompt as row 14 in
the Step 2 table, checked `[x]` once merged.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: This is a reconciliation pass, not a redesign — do not use this prompt as license to
"improve" other parts of `docs/01_class_list.md` you personally would have written differently. Fix only
the three (or four, if time allows) items above.**
