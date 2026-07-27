# Prompt 10_server_5 — DisconnectController Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_server_2` (MatchmakingController) should be merged first, for the same reason noted in `10_server_3`/
`10_server_4` — this controller's real runtime `MatchModel`/`MatchBroadcastView` come from there via
`ConnectionHandler.bindMatch`. This prompt's own tests mock both.

---

### CRITICAL correction: this controller does not own a grace-period timer
The current stub's doc comment says this controller "owns the 30-second reconnect grace-period timer." That
was written before `MatchModel.tick()` existed. Since `09_server_5` (already merged), `MatchModel.tick()`
**already** checks every disconnected participant's elapsed grace period on every tick and ends the match
via `DISCONNECT_FORFEIT` once 30 seconds have passed (R6.3, R6.4) — see `packages/server/src/model/
MatchModel.ts`'s `tick()` method, the `for (const p of this.participants) if
(p.connectionStatus === ConnectionStatus.DISCONNECTED ...)` block. A second, independently-scheduled timer
in this controller would be redundant and could race the tick-driven one (e.g. firing at a slightly
different boundary than the tick that already checks it). This controller's only real job is forwarding to
`MatchModel.disconnect`/`reconnect` — do not add a `setTimeout` here.

---

### 1. Replace `packages/server/src/controller/DisconnectController.ts` with:

```ts
import { AbstractController, SOCKET_EVENTS } from '@arena/shared';
import { MatchModel } from '../model/MatchModel';
import { MatchBroadcastView } from '../view/MatchBroadcastView';

/** Payload ConnectionHandler forwards for a `disconnect` or `match:reconnect` event. */
export interface DisconnectRequest {
  playerId: string;
}

/**
 * Handles socket disconnect and `match:reconnect` events (R6.1–R6.4). Unlike CombatController/
 * ChampionSelectController, a reconnect failure is genuinely exceptional (the player missed their
 * window) and is surfaced to the caller rather than swallowed.
 *
 * CORRECTION (Step 10): this controller does not own a separate grace-period timer, despite the original
 * stub's doc comment suggesting it should — `MatchModel.tick()` (implemented and merged in `09_server_5`)
 * already checks every disconnected participant's elapsed grace period on every tick and ends the match
 * via `DISCONNECT_FORFEIT` once 30s have passed (R6.3, R6.4). A second, independently-scheduled timer
 * here would be redundant and could race the tick-driven one. This controller's only job is forwarding to
 * `MatchModel.disconnect`/`reconnect`.
 */
export class DisconnectController extends AbstractController {
  constructor(model: MatchModel, view: MatchBroadcastView) {
    super(model, view);
  }

  /**
   * Dispatches a `disconnect` or `match:reconnect` event to the underlying MatchModel.
   * @param action - 'disconnect' or 'match:reconnect'
   * @param payload - the reconnecting/disconnecting player's identity
   * @throws {GracePeriodExpiredError} if 'match:reconnect' arrives after the 30-second grace period (R6.3, R6.4)
   */
  operation(action: string, payload?: DisconnectRequest): void {
    if (!payload) return;
    const match = this.model as MatchModel;
    if (action === SOCKET_EVENTS.MATCH_RECONNECT) {
      match.reconnect(payload.playerId);
    } else {
      match.disconnect(payload.playerId);
    }
  }
}
```

### 2. Create `packages/server/src/controller/DisconnectController.test.ts` with:

```ts
import { GracePeriodExpiredError, SOCKET_EVENTS } from '@arena/shared';
import { DisconnectController } from './DisconnectController';
import type { MatchModel } from '../model/MatchModel';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';

function makeMatch(overrides: Partial<MatchModel> = {}): MatchModel {
  return { id: 'm1', disconnect: jest.fn(), reconnect: jest.fn(), ...overrides } as unknown as MatchModel;
}

const view = {} as MatchBroadcastView;

describe('DisconnectController', () => {
  describe('operation', () => {
    it("forwards 'disconnect' to MatchModel.disconnect", () => {
      const match = makeMatch();
      const controller = new DisconnectController(match, view);
      controller.operation('disconnect', { playerId: 'p1' });
      expect(match.disconnect).toHaveBeenCalledWith('p1');
    });

    it('forwards match:reconnect to MatchModel.reconnect', () => {
      const match = makeMatch();
      const controller = new DisconnectController(match, view);
      controller.operation(SOCKET_EVENTS.MATCH_RECONNECT, { playerId: 'p1' });
      expect(match.reconnect).toHaveBeenCalledWith('p1');
    });

    it('lets GracePeriodExpiredError propagate uncaught on a late reconnect (R6.3, R6.4)', () => {
      const match = makeMatch({
        reconnect: jest.fn(() => {
          throw new GracePeriodExpiredError('p1', 'm1');
        }),
      });
      const controller = new DisconnectController(match, view);
      expect(() => controller.operation(SOCKET_EVENTS.MATCH_RECONNECT, { playerId: 'p1' })).toThrow(
        GracePeriodExpiredError,
      );
    });

    it('is a no-op when payload is missing', () => {
      const match = makeMatch();
      const controller = new DisconnectController(match, view);
      expect(() => controller.operation('disconnect')).not.toThrow();
      expect(match.disconnect).not.toHaveBeenCalled();
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest DisconnectController
--coverage --collectCoverageFrom="src/controller/DisconnectController.ts"` — validated result: **4 tests
passing, 100% statement/branch/function/line coverage**. Also update `docs/01_class_list.md` §5b's
`DisconnectController` row: remove "owns the grace-period timer" from its description (it does not — see
the correction above); the row's operation signature/throws stay as documented. Branch `server` from `main`
(or reuse an already-checked-out `server` branch), commit `Step 10: DisconnectController implementation and
tests, docs correction`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: do not add a `setTimeout`/grace-period timer to this controller.** `MatchModel.tick()` already
owns that check every tick (20Hz, `09_server_5`); a second timer here would double-handle the same forfeit
and risk racing it.
