# Prompt 03_api_1 — TSDoc Pass and Contingency Review: `packages/api`

**Owner: En** (per SRS Appendix C: game design, data layer, persistence). This is the first prompt written
specifically for you to run in your own session — you don't need to wait for Marshall's `03_shared_1` or
`03_server_1` to merge, only to read the convention `03_shared_1` establishes (§1, referenced below).

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`, then `prompts/03_shared_1_tsdoc-and-contingency-review.md`
§1 for the TSDoc convention — it is not repeated here.** Document every class in `packages/api/src/`, and
review this package's operations for missing exception coverage — this package touches PostgreSQL
directly, so the "external I/O failure" contingency category matters more here than anywhere else in the
system.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/api/src/**/*.ts` already compile (Step 2 complete).
- **End**: every class has a class-level doc comment; every constructor parameter property and operation
  has parameter/return/throws documentation; `npm run typecheck -w @arena/api` still passes.

---

### 1. Files to cover
```
model/: PlayerRepository.ts, MatchRepository.ts, LeaderboardEntry.ts, LeaderboardRepository.ts, PendingMatchCorrelator.ts
controller/: InternalMatchController.ts, MatchHistoryController.ts, LeaderboardController.ts
view/: LeaderboardResponseView.ts, MatchHistoryResponseView.ts, ErrorResponseView.ts
util/: PgPool.ts
ApiMain.ts, index.ts (index.ts is a two-line bootstrap — one line is enough)
```

### 2. Worked example — every repository method needs a `@throws PersistenceError`

Every method that touches `PgPool` can fail for reasons outside the application's control (connection
drop, constraint violation, timeout). Use this as the pattern for all of `model/*Repository.ts`:

```ts
/**
 * Finds the Player row for a username, creating one if this is the first time it's been seen (R-DB1,
 * SRS 3.2.1 — there is no separate registration step).
 * @param username - the client-supplied username
 * @returns the existing or newly-created Player
 * @throws {PersistenceError} if the underlying query fails
 */
async findOrCreateByUsername(username: string): Promise<Player> {
  throw new NotImplementedError('PlayerRepository.findOrCreateByUsername not yet implemented');
}
```

And for `PendingMatchCorrelator` — document the idempotency requirement explicitly, since it's the one
class in this package whose correctness depends on a subtlety the code alone doesn't make obvious:

```ts
/**
 * Reconciles the game server's two separate HTTP reports (match begin, match end — SRS 3.2.7.4 step 26)
 * into one record ready for MatchRepository.recordMatch(). CRITICAL CHECKPOINT
 * (prompts/00_master_context.md §8): recordBegin/recordEnd must be idempotent per matchId — a retried
 * report from the server (e.g. after a timeout) must not double-persist a match.
 */
export class PendingMatchCorrelator { ... }
```

### 3. Contingency review — api-specific angle (persistence and REST)

- Every `*Repository` method that queries or writes must have `@throws {PersistenceError}` — check none
  were missed (R7.4, R-DB4).
- `MatchRepository.recordMatch` specifically should note in its doc comment that it must not persist a
  match that ended before champion selection completed (R7.2) — that's a precondition the *caller*
  (`InternalMatchController`) is responsible for, not this method; document whose job it is so it isn't
  silently assumed by whoever implements it later.
- `LeaderboardRepository.computeLeaderboard`'s doc comment should state win rate is derived from match
  history, not a maintained running total (R8.1) — this is a correctness property worth stating explicitly
  since it's easy to accidentally "optimize" into a running counter during implementation.
- The three `*ResponseView` classes are plain formatters, not `View` implementers (confirmed correct in
  the Step 2 audit and already fixed in `docs/01_class_list.md`) — their doc comments should say what
  shape they produce, not describe a push/observe relationship they don't have.

If you find a genuine gap, follow `03_shared_1` §3's procedure (new exception class in
`packages/shared/src/exceptions/`, barrel export, class list row, called out in your commit message).

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/api` passes. Branch `api` from `main` (`git
branch -D api 2>/dev/null; git checkout -b api main`), commit `Step 3: api TSDoc pass and contingency
review`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Do not change any method's behavior or signature — comments only, plus a new exception in
`packages/shared/src/exceptions/` only if §3 turns up a genuine gap. If you find yourself editing a method
body's logic (e.g. actually writing SQL), stop — that's Step 8+, not this prompt.**
