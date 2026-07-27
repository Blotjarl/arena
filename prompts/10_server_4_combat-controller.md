# Prompt 10_server_4 — CombatController Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_server_2` (MatchmakingController) should be merged first, for the same reason noted in `10_server_3` —
this controller's real runtime `MatchModel`/`MatchBroadcastView` come from there via
`ConnectionHandler.bindMatch`. This prompt's own tests mock both.

---

### Design note: distinguishing movement from ability use
The wire contract's `match:action` event carries either a `MovementInput` (`{dx, dy}`) or an
`AbilityUseRequest` (`{abilityId, ...}`) — SRS Appendix A treats them as one event, distinguished by shape.
`ConnectionHandler` (`10_server_6`) wraps whichever one arrives together with the connection's identified
`playerId` (the raw wire payload carries no playerId); this controller distinguishes the two by checking
for `abilityId`'s presence, then delegates to `MatchModel.submitMove`/`submitAbility` respectively. Every
failure mode — an out-of-phase action, or anything `MatchModel.submitAbility` already swallows internally
(cooldown, resource, incapacitation, range, R4.2) — is caught here and dropped silently, matching R4's
"silently ignores" behavior exactly; this controller never surfaces anything to the player.

---

### 1. Replace `packages/server/src/controller/CombatController.ts` with:

```ts
import { AbstractController, MovementInput, AbilityUseRequest } from '@arena/shared';
import { MatchModel } from '../model/MatchModel';
import { MatchBroadcastView } from '../view/MatchBroadcastView';

/** Payload ConnectionHandler forwards for a `match:action` request — the connection's identified playerId plus the raw wire input (movement or ability use, distinguished by the presence of `abilityId`). */
export interface CombatActionRequest {
  playerId: string;
  input: MovementInput | AbilityUseRequest;
}

function isAbilityUse(input: MovementInput | AbilityUseRequest): input is AbilityUseRequest {
  return 'abilityId' in input;
}

/** Handles in-combat movement and ability-use requests during the ACTIVE phase (R4.1–R4.6). */
export class CombatController extends AbstractController {
  constructor(model: MatchModel, view: MatchBroadcastView) {
    super(model, view);
  }

  /**
   * Dispatches a `match:action` request (movement or ability use) to the underlying MatchModel.
   * Every failure mode this can encounter — an out-of-phase action (InvalidMatchPhaseError) as well as
   * the ability-specific contingencies MatchModel.submitAbility() already catches internally (cooldown,
   * resource, incapacitation, range, R4.2) — is caught here and swallowed rather than surfaced as an
   * exception to the player: an invalid action simply has no effect, per R4's "silently ignores" behavior.
   * @param action - the combat action, e.g. 'match:action'
   * @param payload - the acting player and movement input or an ability-use request
   */
  operation(action: string, payload?: CombatActionRequest): void {
    if (!payload) return;
    const match = this.model as MatchModel;
    try {
      if (isAbilityUse(payload.input)) {
        match.submitAbility(payload.playerId, payload.input);
      } else {
        match.submitMove(payload.playerId, payload.input);
      }
    } catch {
      // InvalidMatchPhaseError (or anything else): swallowed, per R4.1/R4.2's "silently ignores" behavior.
    }
  }
}
```

### 2. Create `packages/server/src/controller/CombatController.test.ts` with:

```ts
import { InvalidMatchPhaseError, EffectType } from '@arena/shared';
import { CombatController } from './CombatController';
import type { MatchModel } from '../model/MatchModel';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';

function makeMatch(overrides: Partial<MatchModel> = {}): MatchModel {
  return {
    id: 'm1',
    submitMove: jest.fn(),
    submitAbility: jest.fn(),
    ...overrides,
  } as unknown as MatchModel;
}

const view = {} as MatchBroadcastView;

describe('CombatController', () => {
  describe('operation', () => {
    it('forwards movement input to MatchModel.submitMove', () => {
      const match = makeMatch();
      const controller = new CombatController(match, view);
      controller.operation('match:action', { playerId: 'p1', input: { dx: 1, dy: 0 } });
      expect(match.submitMove).toHaveBeenCalledWith('p1', { dx: 1, dy: 0 });
      expect(match.submitAbility).not.toHaveBeenCalled();
    });

    it('forwards an ability-use request to MatchModel.submitAbility, distinguished by abilityId', () => {
      const match = makeMatch();
      const controller = new CombatController(match, view);
      controller.operation('match:action', { playerId: 'p1', input: { abilityId: 'bolt', targetPlayerId: 'p2' } });
      expect(match.submitAbility).toHaveBeenCalledWith('p1', { abilityId: 'bolt', targetPlayerId: 'p2' });
      expect(match.submitMove).not.toHaveBeenCalled();
    });

    it('swallows InvalidMatchPhaseError rather than throwing (R4.1)', () => {
      const match = makeMatch({
        submitMove: jest.fn(() => {
          throw new InvalidMatchPhaseError('m1', 'ACTIVE', 'CHAMPION_SELECT');
        }),
      });
      const controller = new CombatController(match, view);
      expect(() => controller.operation('match:action', { playerId: 'p1', input: { dx: 1, dy: 0 } })).not.toThrow();
    });

    it('is a no-op when payload is missing', () => {
      const match = makeMatch();
      const controller = new CombatController(match, view);
      expect(() => controller.operation('match:action')).not.toThrow();
      expect(match.submitMove).not.toHaveBeenCalled();
      expect(match.submitAbility).not.toHaveBeenCalled();
    });

    it('references EffectType only to document ability payload shape (sanity import check)', () => {
      expect(EffectType.DAMAGE).toBeDefined();
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest CombatController
--coverage --collectCoverageFrom="src/controller/CombatController.ts"` — validated result: **5 tests
passing, 100% statement/branch/function/line coverage**. Branch `server` from `main` (or reuse an
already-checked-out `server` branch), commit `Step 10: CombatController implementation and tests`, push,
open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this controller must never let anything propagate out of `operation()` — the try/catch's empty
`catch` block is intentional, not a placeholder.** R4's "silently ignores" behavior is a hard requirement,
not a convenience; do not add error reporting here even if it seems more informative for debugging.
