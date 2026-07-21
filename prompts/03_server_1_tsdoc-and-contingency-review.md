# Prompt 03_server_1 — TSDoc Pass and Contingency Review: `packages/server`

**Owner: Marshall** (per SRS Appendix C: server architecture, real-time systems).

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`, then `prompts/03_shared_1_tsdoc-and-contingency-review.md`
§1 for the TSDoc convention this prompt uses — it is not repeated here.** This prompt does not need
`03_shared_1`'s branch to be merged first; it only needs you to have read that convention. Document every
class in `packages/server/src/`, and review this package's operations for missing exception coverage.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/server/src/**/*.ts` already compile (Step 2 complete).
- **End**: every class has a class-level doc comment; every constructor parameter property and operation
  has parameter/return/throws documentation; `npm run typecheck -w @arena/server` still passes.

---

### 1. Files to cover
```
model/: QueueEntry.ts, MatchmakingQueue.ts, ParticipantState.ts, MatchModel.ts, TickLoop.ts
controller/: ConnectionHandler.ts, PlayerIdentifyController.ts, MatchmakingController.ts,
             ChampionSelectController.ts, CombatController.ts, DisconnectController.ts, MatchReportingClient.ts
view/: MatchmakingBroadcastView.ts, MatchBroadcastView.ts
ServerMain.ts, index.ts (index.ts is a two-line bootstrap — one line is enough, no class to document)
```

### 2. Worked example — the package's most complex class (`model/ParticipantState.ts`)

This is the class most likely to need real thought, since almost every operation here has genuine
contingencies (R4.2). Use it as your bar for the rest of `model/`:

```ts
/**
 * A single player's live combat state within one match — position, health, resource, cooldowns, and
 * connection status. Not an AbstractModel; observed indirectly through its owning MatchModel
 * (docs/01_class_list.md §5a).
 */
export class ParticipantState {
  // ... existing fields, each get a one-line doc comment per 03_shared_1 §1 ...

  /**
   * Applies incoming ability/effect damage to this participant's health, clamped at zero.
   * @param amount - damage to subtract from health; must be non-negative
   */
  applyDamage(amount: number): void { ... }

  /**
   * Validates and applies an ability use: cooldown, resource cost, and incapacitation are all checked
   * before any effect is applied (R4.2).
   * @param ability - the ability being used
   * @param now - current simulation time, for cooldown comparison
   * @throws {AbilityOnCooldownError} if the ability's cooldown has not elapsed
   * @throws {InsufficientResourceError} if resource is below the ability's cost
   * @throws {ActorIncapacitatedError} if this participant is dead or crowd-controlled
   */
  useAbility(ability: Ability, now: number): void { ... }
}
```

### 3. Contingency review — server-specific angle

Beyond the general four failure categories in `03_shared_1` §3, check specifically:
- Does `TickLoop.onTick()`'s doc comment restate the per-match isolation requirement (already flagged as
  a CRITICAL CHECKPOINT in the code comment from Step 2) — confirm it's still accurate, don't weaken it.
- Does `MatchModel.submitAbility` / `ParticipantState.useAbility`'s `@throws` list match exactly what
  `docs/01_class_list.md` §5a documents — R4.2's four contingencies (cooldown, resource, incapacitation,
  range) should all appear somewhere across `MatchModel`/`ParticipantState`, not be missing one.
- `ConnectionHandler` and `MatchReportingClient` are plain adapters (confirmed correct in the Step 2
  audit) — don't add `@throws` tags implying they raise `ArenaError` subclasses to callers; document their
  actual failure handling (log-and-swallow for `MatchReportingClient`, per R7.4).

If you find a genuine gap, follow `03_shared_1` §3's procedure (new exception class, barrel export, class
list row, called out in your commit message) — you're touching `packages/shared/src/exceptions/` in that
case, which is fine, it's a small, low-conflict addition.

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes. Branch `server` from `main`
(`git branch -D server 2>/dev/null; git checkout -b server main`), commit `Step 3: server TSDoc pass and
contingency review`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Do not change any method's behavior or signature in this prompt — comments and, if genuinely
necessary, new `@throws` tags referencing exceptions that already exist or that you add to `shared`. If
you find yourself editing a method body's logic, stop — that's Step 8+, not this prompt.**
