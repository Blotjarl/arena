# Prompt 03_shared_1 — TSDoc Pass and Contingency Review: `packages/shared`

**Owner: Marshall.** Combines `docs/ProjectProcess.txt` Steps 3 and 5's declaration-completeness work
for `packages/shared` (Step 4 — "make sure your code compiles" — is satisfied by this prompt's own
verification step, not a separate prompt; see `prompts/00_master_context.md` §10).

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`.** Step 2 already produced complete attribute/operation
*declarations* and compiling stubs (verified — see the Step 2 audit in this repo's history). What Step 2
did **not** produce is comprehensive documentation, or a second look at whether the declared exception set
is actually complete now that the whole system is visible together. This prompt does both, for
`packages/shared` only. **This prompt establishes the TSDoc convention every other Step 3 prompt
(`03_server_1`, `03_client_1`, `03_api_1`) references instead of repeating — read it even if you're
running one of those instead of this one.**

---

### MANDATORY: Sandwich Requirement
- **Start**: every file in `packages/shared/src/` already compiles (Step 2 complete, verified).
- **End**: every exported class, interface, and enum has a class-level doc comment; every constructor
  parameter property and operation has parameter/return/throws documentation per §1 below; `npm run
  typecheck -w @arena/shared` still passes (doc comments cannot break compilation, but confirm anyway).

---

### 1. TSDoc convention — use exactly this pattern everywhere in this repo

**Class/interface/abstract class**: one doc comment directly above the declaration — one sentence on what
it represents and its role, a second sentence (only if non-obvious) for invariants or cross-references.

**Constructor parameter properties** (our code style declares fields this way — `constructor(public
readonly x: number, ...)`): a one-line doc comment directly above each parameter, not a block of `@param`
tags in the constructor's own comment.

**Operations**: `@param name - description` for each parameter, `@returns description` for a non-void
return, `@throws {ExceptionClassName} description` for each exception the class list documents it as
throwing (or that you discover during the contingency review in §3).

**Enums**: one doc comment on the enum itself (what it represents, which SRS requirement); per-member
comments only where the member name doesn't make its meaning obvious (rare in this codebase — skip it for
self-explanatory members like `WIN`/`LOSS`/`DRAW`).

**Worked example 1 — simple data class** (`domain/Position.ts`):
```ts
import { NotImplementedError } from '../util/NotImplementedError';

/** A 2D point in arena-space. Used for champion positions and ability targeting. */
export class Position {
  constructor(
    /** Horizontal coordinate. */
    public readonly x: number,
    /** Vertical coordinate. */
    public readonly y: number,
  ) {}

  /**
   * Euclidean distance between this position and another.
   * @param other - the position to measure to
   * @returns the straight-line distance, in the same units as x and y
   */
  distanceTo(other: Position): number {
    throw new NotImplementedError('Position.distanceTo not yet implemented');
  }
}
```

**Worked example 2 — operation with `@throws`** (`domain/ChampionRoster.ts`):
```ts
/**
 * Looks up a champion definition by id.
 * @param id - the champion identifier to resolve
 * @returns the matching Champion
 * @throws {InvalidChampionSelectionError} if id does not match any champion in the roster
 */
static getById(id: ChampionId): Champion {
  throw new NotImplementedError('ChampionRoster.getById not yet implemented');
}
```

**Worked example 3 — exception class** (`exceptions/AlreadyQueuedError.ts`):
```ts
/**
 * Thrown when a player attempts to join the matchmaking queue while already queued or in an active
 * match (R2.2).
 */
export class AlreadyQueuedError extends ArenaError {
  readonly code = 'ALREADY_QUEUED';

  /** @param playerId - the player who attempted to queue again */
  constructor(playerId: PlayerId) {
    super(`Player ${playerId} is already queued or in an active match.`);
  }
}
```
Apply this pattern to all 15 other exception classes too — each already has enough context in its existing
one-line inline comment (from Step 2) to expand into this form; don't invent new rationale.

**Barrel files** (`index.ts` files that only contain `export * from ...` lines): no doc comments needed —
they have no declarations of their own to document.

---

### 2. Files to cover (checklist — every one needs the treatment in §1)

```
mvc/: Model.ts, View.ts, Controller.ts, ModelEvent.ts, ModelListener.ts, AbstractModel.ts, AbstractController.ts
domain/: ids.ts, Team.ts, MatchPhase.ts, ConnectionStatus.ts, EndReason.ts, MatchResult.ts, EffectType.ts,
         Position.ts, Ability.ts, Champion.ts, ChampionRoster.ts, Player.ts, Match.ts, MatchParticipant.ts
contract/: payloads.ts, events.ts, dto.ts (document each interface with a one-line summary of what it
           represents and when it's sent — per-field comments only where a field name alone isn't clear)
exceptions/: ArenaError.ts + all 15 subclasses (index.ts is a barrel, skip)
util/: NotImplementedError.ts (already documented from Step 2 — verify it still matches §1's convention)
```
`ids.ts` needs only one line per type alias (e.g. `/** Stable identifier for a Player row. */`).

---

### 3. Contingency review — is the exception set actually complete?

For every operation across `packages/shared` that isn't a trivial getter/setter, ask: does its `@throws`
list (from `docs/01_class_list.md` §4, or your own read of the operation's purpose) actually cover every
realistic failure mode, now that the whole system's shape is visible? Concretely, check each operation
against these four failure categories:
- **Invalid input** — is there a `ValidationError` or a more specific exception declared?
- **State/phase mismatch** — `InvalidMatchPhaseError` or similar?
- **Lookup miss** — `PlayerNotFoundError`, `InvalidChampionSelectionError`, or similar?
- **External I/O failure** — `PersistenceError`?

**If you find a genuine gap** (a real failure mode with no matching exception — not a hypothetical
TypeScript can't produce, like a null value where the type system already forbids null): add a new
exception class to `packages/shared/src/exceptions/` following the `ArenaError` pattern in worked example
3, export it from `exceptions/index.ts`, add a row to `docs/01_class_list.md` §4, and call it out
explicitly in your commit message. Don't invent contingencies for their own sake — the existing 16 cover
the SRS's stated failure modes; a real gap should be rare.

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/shared` passes. Branch `shared` from `main`
(delete and recreate if a stale local `shared` branch exists — `git branch -D shared 2>/dev/null; git
checkout -b shared main`), commit `Step 3: shared TSDoc pass and contingency review`, push, open a PR into
`main`. **This should merge before `03_shared_2` (TypeDoc generation) runs**, but `03_server_1`,
`03_client_1`, and `03_api_1` do **not** need to wait for this — they only need to *read* this prompt's
§1 convention, not wait for its branch to merge.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: If you added any new exception class in §3, that's the one code change in this otherwise
docs-only prompt — everything else here is comments, not logic.**
