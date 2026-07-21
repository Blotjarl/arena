# Prompt 03_client_1 — TSDoc Pass and Contingency Review: `packages/client`

**Owner: Raj** (per SRS Appendix C: client application & real-time UX). This is the first prompt written
specifically for you to run in your own session — you don't need to wait for Marshall's `03_shared_1` or
`03_server_1` to merge, only to read the convention `03_shared_1` establishes (§1, referenced below).

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`, then `prompts/03_shared_1_tsdoc-and-contingency-review.md`
§1 for the TSDoc convention — it is not repeated here.** Document every class in `packages/client/src/`,
and review this package's operations for missing exception coverage. **MANDATORY reminder from master
context §1.1**: nothing you document here should describe a client-side method as *computing* an
authoritative outcome — the client mirrors and displays, it never decides.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/client/src/**/*.ts(x)` already compile (Step 2 complete).
- **End**: every class has a class-level doc comment; every constructor parameter property and operation
  has parameter/return/throws documentation; `npm run typecheck -w @arena/client` still passes.

---

### 1. Files to cover
```
model/: ClientIdentityModel.ts, ClientQueueModel.ts, ClientMatchModel.ts, InterpolationBuffer.ts
controller/: SocketConnectionController.ts, LobbyController.ts, ChampionSelectController.ts, MatchController.ts
view/: LobbyView.tsx, ChampionSelectView.tsx, MatchHUDView.tsx, ResultsView.tsx
ClientMain.tsx, index.tsx (index.tsx is a two-line bootstrap — one line is enough)
```

The four `view/*.tsx` files each already have a one-line doc comment on their exported screen *function*
from Step 2 (e.g. `/** Username field, "Find Match" control, queue status/cancel (SRS 3.1.1). */` above
`LobbyScreen`) — leave those as-is, they're already correct. What's missing is documentation on the
paired **class** (constructor, `getModel`/`setModel`/`getController`/`setController`, `modelChanged`) —
that's this prompt's actual gap to fill.

### 2. Worked example — the package's most novel class (`model/InterpolationBuffer.ts`)

This class has no equivalent in the course examples, so document it carefully — a future reader (or
grader) needs to understand *why* it exists, not just what its methods do:

```ts
/**
 * Buffers recent authoritative MatchStatePayload snapshots and produces smoothly-interpolated positions
 * for rendering between the server's 20Hz ticks (R4.7, R-P4). This is a rendering aid only — nothing it
 * produces is written back into ClientMatchModel or treated as authoritative.
 */
export class InterpolationBuffer {
  /**
   * @param capacity - maximum number of snapshots retained; oldest is dropped once exceeded
   */
  constructor(private readonly capacity: number) {}

  /**
   * Records a newly-received authoritative snapshot.
   * @param snapshot - the match state as broadcast by the server
   */
  push(snapshot: MatchStatePayload): void { ... }

  /**
   * Computes a smoothed, render-only position for a participant at the given time, interpolating
   * between the two bracketing snapshots. Never mutates any stored model state.
   * @param playerId - which participant to interpolate
   * @param now - the current render timestamp
   * @returns an interpolated Position for display
   */
  getInterpolatedPosition(playerId: PlayerId, now: number): Position { ... }
}
```

### 3. Contingency review — client-specific angle

The client rarely throws domain exceptions itself (the server is authoritative), so this review is
narrower than the server's:
- `LobbyController.operation('submitUsername', ...)` does a client-side length/non-empty check mirroring
  R1.1 — confirm its doc comment says this is a **pre-check** (UX only), and that the server still
  re-validates; don't document it as if client-side validation alone is sufficient.
- `SocketConnectionController` is a plain adapter (confirmed correct in the Step 2 audit) — document its
  error handling honestly: what happens if the socket disconnects mid-send? If the class doesn't yet
  handle that, say so in a comment rather than implying it does (comments must describe what the stub
  will do once implemented, not overstate current behavior).
- If you find a genuine missing exception (rare on this side), follow `03_shared_1` §3's procedure.

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes. Branch `client` from `main`
(`git branch -D client 2>/dev/null; git checkout -b client main`), commit `Step 3: client TSDoc pass and
contingency review`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Do not change any method's behavior or signature — comments only, plus a new exception in
`packages/shared/src/exceptions/` only if §3 turns up a genuine gap. If you find yourself editing a method
body's logic, stop — that's Step 8+, not this prompt.**
