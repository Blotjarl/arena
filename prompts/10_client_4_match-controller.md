# Prompt 10_client_4 — MatchController Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_client_1` (`SocketConnectionController`) must be merged first — this controller has nothing to actually
emit through without it.

### CRITICAL: this controller never resolves an ability or movement outcome
Per master context §1.1, `MatchController` forwards raw input requests and nothing more — it does not
check cooldowns, resource costs, range, or crowd-control state before sending, and it does not touch
`ClientMatchModel` at all. The server (`CombatController`, `ParticipantState.useAbility`/`.move`) is the
sole authority on whether a move or ability use has any effect (R4.1, R4.2); a rejected or silently-ignored
request is reflected only in the next `match:state` broadcast, never asserted client-side.

---

### Design notes

**Only `move` is throttled — `useAbility` never is.** `move` is fired at the render/input frame rate
(held-down directional keys can easily produce far more than 20 events/sec), which would flood the socket
well past what the server's 20Hz tick loop can act on (R-P1). `useAbility` is a discrete, deliberate action
— one key press or click per use — so there is no flood to guard against, and throttling it would only add
perceived input lag to a one-shot action. The throttle window is 50ms, matching the server's tick interval
exactly (no point emitting movement input faster than the server can consume it).

**CRITICAL CHECKPOINT: the throttle sentinel bug this prompt's own tests caught.** The first implementation
used `0` as the "never yet emitted" sentinel for `lastMoveEmitAt`, reasoning that any real `Date.now()`
value would be far larger than zero. That collides with exactly the deterministic test clock this prompt
uses to avoid relying on real wall-clock timing (`now: () => t`, starting at `t = 0`) — the very first
`move` call was incorrectly throttled, since `0 - 0 < 50`. Use `null` as the sentinel, not `0`, and check
`this.lastMoveEmitAt !== null` before comparing. Keep the "forwards the first move immediately" test in
this batch — it is what catches a regression back to the `0`-sentinel bug.

**The clock is constructor-injected** (`now: () => number = () => Date.now()`), the same testability
principle used throughout this codebase (master context §4.2) — tests control time deterministically via a
fake clock closure rather than real timers or `jest.useFakeTimers()`.

---

### 1. Replace `packages/client/src/controller/MatchController.ts` with:

```ts
import { AbstractController, SOCKET_EVENTS, MovementInput, AbilityUseRequest } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { MatchHUDView } from '../view/MatchHUDView';
import { SocketConnectionController } from './SocketConnectionController';

/** Minimum milliseconds between two 'move' emissions — matches the server's 20Hz tick rate (R-P1). */
const MOVE_THROTTLE_MS = 50;

/**
 * Handles in-combat player input during the COMBAT phase (R4.1–R4.6).
 * Translates UI events (keyboard, pointer) into server action requests; applies client-side
 * input throttling so the socket is not flooded at the render frame rate.
 */
export class MatchController extends AbstractController<ClientMatchModel, MatchHUDView> {
  /** Wall-clock time (ms) the last 'move' action was actually emitted; null means never yet. */
  private lastMoveEmitAt: number | null = null;

  /**
   * CORRECTION (Step 10): as with the other client controllers in this batch, needs a
   * SocketConnectionController reference to actually emit anything — docs/01_class_list.md §6b's
   * constructor sketch only documents the inherited (model, view) shape.
   * @param model - the match model this controller reads from (never mutated here)
   * @param view - the paired MatchHUDView
   * @param socketController - used to emit `match:action` to the server
   * @param now - clock function, injected for deterministic throttle testing (defaults to Date.now)
   */
  constructor(
    model: ClientMatchModel,
    view: MatchHUDView,
    private readonly socketController: SocketConnectionController,
    private readonly now: () => number = () => Date.now(),
  ) {
    super(model, view);
  }

  /**
   * Throttles and forwards a combat action to the server.
   * Supported actions: 'move' (directional input), 'useAbility' (ability slot activation).
   * The server validates cooldowns, resource costs, and phase legality before applying any effect
   * (R4.1) — this controller never asserts an outcome.
   *
   * 'move' is throttled to at most once per MOVE_THROTTLE_MS (50ms, matching the server's 20Hz tick
   * rate) — held-down directional input fires at the render frame rate, which would otherwise flood
   * the socket well beyond what the server can act on. 'useAbility' is a discrete, deliberate action
   * (a single key press or click), not continuous input, so it is never throttled — every call is
   * forwarded immediately.
   * @param action - 'move' or 'useAbility'
   * @param payload - action-specific data: MovementInput for 'move', AbilityUseRequest for 'useAbility'
   */
  operation(action: string, payload?: MovementInput | AbilityUseRequest): void {
    if (!payload) return;
    switch (action) {
      case 'move': {
        const t = this.now();
        if (this.lastMoveEmitAt !== null && t - this.lastMoveEmitAt < MOVE_THROTTLE_MS) return;
        this.lastMoveEmitAt = t;
        this.socketController.operation(SOCKET_EVENTS.MATCH_ACTION, payload as MovementInput);
        break;
      }
      case 'useAbility':
        this.socketController.operation(SOCKET_EVENTS.MATCH_ACTION, payload as AbilityUseRequest);
        break;
    }
  }
}
```

### 2. Create `packages/client/src/controller/MatchController.test.ts` with:

```ts
import { MatchController } from './MatchController';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { MatchHUDView } from '../view/MatchHUDView';
import type { SocketConnectionController } from './SocketConnectionController';

function makeSocketController(): SocketConnectionController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as SocketConnectionController & { operation: jest.Mock };
}

function makeView(): MatchHUDView {
  return {} as unknown as MatchHUDView;
}

function makeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('MatchController', () => {
  describe('move', () => {
    it('forwards the first move immediately', () => {
      const socketController = makeSocketController();
      const clock = makeClock();
      const controller = new MatchController(new ClientMatchModel(), makeView(), socketController, clock.now);

      controller.operation('move', { dx: 1, dy: 0 });

      expect(socketController.operation).toHaveBeenCalledWith('match:action', { dx: 1, dy: 0 });
    });

    it('CRITICAL: throttles a second move within 50ms of the first — does not emit', () => {
      const socketController = makeSocketController();
      const clock = makeClock();
      const controller = new MatchController(new ClientMatchModel(), makeView(), socketController, clock.now);

      controller.operation('move', { dx: 1, dy: 0 });
      clock.advance(20);
      controller.operation('move', { dx: 0, dy: 1 });

      expect(socketController.operation).toHaveBeenCalledTimes(1);
    });

    it('emits again once at least 50ms have elapsed since the last emitted move', () => {
      const socketController = makeSocketController();
      const clock = makeClock();
      const controller = new MatchController(new ClientMatchModel(), makeView(), socketController, clock.now);

      controller.operation('move', { dx: 1, dy: 0 });
      clock.advance(50);
      controller.operation('move', { dx: 0, dy: 1 });

      expect(socketController.operation).toHaveBeenCalledTimes(2);
      expect(socketController.operation).toHaveBeenLastCalledWith('match:action', { dx: 0, dy: 1 });
    });

    it('does nothing when payload is omitted', () => {
      const socketController = makeSocketController();
      const controller = new MatchController(new ClientMatchModel(), makeView(), socketController);

      controller.operation('move');

      expect(socketController.operation).not.toHaveBeenCalled();
    });
  });

  describe('useAbility', () => {
    it('forwards every call immediately, never throttled', () => {
      const socketController = makeSocketController();
      const clock = makeClock();
      const controller = new MatchController(new ClientMatchModel(), makeView(), socketController, clock.now);

      controller.operation('useAbility', { abilityId: 'bolt' });
      clock.advance(1);
      controller.operation('useAbility', { abilityId: 'bolt' });

      expect(socketController.operation).toHaveBeenCalledTimes(2);
      expect(socketController.operation).toHaveBeenNthCalledWith(1, 'match:action', { abilityId: 'bolt' });
      expect(socketController.operation).toHaveBeenNthCalledWith(2, 'match:action', { abilityId: 'bolt' });
    });

    it("useAbility calls do not consume the 'move' throttle window", () => {
      const socketController = makeSocketController();
      const clock = makeClock();
      const controller = new MatchController(new ClientMatchModel(), makeView(), socketController, clock.now);

      controller.operation('move', { dx: 1, dy: 0 });
      controller.operation('useAbility', { abilityId: 'bolt' });
      clock.advance(20);
      controller.operation('move', { dx: 0, dy: 1 });

      // second move is still within 50ms of the first move (useAbility didn't reset anything) -> throttled
      expect(socketController.operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('unrecognized action', () => {
    it('does nothing and does not throw', () => {
      const socketController = makeSocketController();
      const controller = new MatchController(new ClientMatchModel(), makeView(), socketController);

      expect(() => controller.operation('nonsense', { dx: 0, dy: 0 })).not.toThrow();
      expect(socketController.operation).not.toHaveBeenCalled();
    });
  });

  describe('default clock', () => {
    it('uses Date.now when no clock is injected', () => {
      const socketController = makeSocketController();
      const controller = new MatchController(new ClientMatchModel(), makeView(), socketController);

      controller.operation('move', { dx: 1, dy: 0 });

      expect(socketController.operation).toHaveBeenCalledWith('match:action', { dx: 1, dy: 0 });
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes; `npx jest MatchController
--coverage --collectCoverageFrom="src/controller/MatchController.ts"` — validated result: **8 tests
passing, 100% statement/branch/function/line coverage**, including the CRITICAL CHECKPOINT test for the
sentinel bug described above. Branch `client` from `main` (or reuse an already-checked-out `client`
branch), commit `Step 10: MatchController implementation and tests`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: do not regress the throttle sentinel to `0`.** A test clock (or, less obviously, a machine that
has been running long enough for `performance.now()`-style clocks to wrap, or any clock a future refactor
swaps in) can legitimately start at `0` — `null` is the only sentinel that can't collide with a real
timestamp. The "forwards the first move immediately" test exists specifically to catch this regression;
keep it.
