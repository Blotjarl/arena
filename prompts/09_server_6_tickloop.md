# Prompt 09_server_6 — TickLoop Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
**MANDATORY prerequisite: `09_server_5` (MatchModel, complete) must be merged first.** This is the last
server-model prompt — once merged, `packages/server`'s model package is fully implemented, satisfying
`docs/ProjectProcess.txt` Step 9 for this track. Code below is already validated (implemented and
test-run against this real repo).

---

### 1. Replace `packages/server/src/model/TickLoop.ts` with:

```ts
import { MatchId } from '@arena/shared';
import { MatchModel } from './MatchModel';

/**
 * The server's single authoritative simulation driver: ticks every registered MatchModel at a fixed
 * rate (R-P1, 20Hz by default) and isolates each match's failures from every other (R5.4, 3.6.2). One
 * process-wide instance, aggregating (not owning the lifecycle of) the matches it drives — a match is
 * created by MatchmakingController and merely registered here.
 */
export class TickLoop {
  private matches: Map<MatchId, MatchModel> = new Map();
  private handle: NodeJS.Timeout | null = null;

  constructor(
    /** Ticks per second; defaults to 20 per R-P1. */
    private readonly tickRateHz: number = 20,
  ) {}

  /**
   * Adds a match to the set driven by this loop's ticking.
   * @param match - the match to start ticking; keyed by its own id
   */
  register(match: MatchModel): void {
    this.matches.set(match.id, match);
  }

  /**
   * Removes a match from the ticking set, e.g. once it has ended.
   * @param matchId - the match to stop ticking
   */
  unregister(matchId: MatchId): void {
    this.matches.delete(matchId);
  }

  /** Starts the fixed-rate timer that invokes onTick(); a no-op if already running. */
  start(): void {
    if (this.handle !== null) return;
    this.handle = setInterval(() => this.onTick(), 1000 / this.tickRateHz);
  }

  /** Stops the fixed-rate timer; a no-op if not running. */
  stop(): void {
    if (this.handle === null) return;
    clearInterval(this.handle);
    this.handle = null;
  }

  /**
   * CRITICAL CHECKPOINT (prompts/00_master_context.md §8): iterates every registered match and calls its
   * tick() inside a try/catch scoped to that match alone, so one match's internal error is logged and
   * skipped rather than propagating — it must never crash the loop or affect any other in-progress match
   * (R5.4, 3.6.2). deltaSeconds is the fixed nominal tick interval (1 / tickRateHz), not a measured
   * wall-clock delta — Node's setInterval isn't perfectly precise, and a fixed simulation step is more
   * deterministic (and more testable) than trusting measured jitter.
   */
  private onTick(): void {
    const deltaSeconds = 1 / this.tickRateHz;
    for (const [matchId, match] of this.matches) {
      try {
        match.tick(deltaSeconds);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`TickLoop: match ${matchId} threw during tick(), isolated from other matches:`, err);
      }
    }
  }
}
```

### 2. Create `packages/server/src/model/TickLoop.test.ts` with:

```ts
import { TickLoop } from './TickLoop';
import type { MatchModel } from './MatchModel';

function fakeMatch(id: string, tickImpl: (deltaSeconds: number) => void): MatchModel {
  return { id, tick: jest.fn(tickImpl) } as unknown as MatchModel;
}

describe('TickLoop', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('register / unregister', () => {
    it('drives a registered match and stops driving it once unregistered', () => {
      const loop = new TickLoop(20);
      const tick = jest.fn();
      const match = fakeMatch('m1', tick);
      loop.register(match);
      loop.start();
      jest.advanceTimersByTime(1000 / 20);
      expect(tick).toHaveBeenCalledTimes(1);

      loop.unregister('m1');
      jest.advanceTimersByTime(1000 / 20);
      expect(tick).toHaveBeenCalledTimes(1);
      loop.stop();
    });
  });

  describe('start / stop', () => {
    it('ticks at the configured rate and is idempotent', () => {
      const loop = new TickLoop(20);
      const tick = jest.fn();
      loop.register(fakeMatch('m1', tick));

      loop.start();
      loop.start();
      jest.advanceTimersByTime(200);
      expect(tick).toHaveBeenCalledTimes(4);

      loop.stop();
      loop.stop();
      jest.advanceTimersByTime(200);
      expect(tick).toHaveBeenCalledTimes(4);
    });

    it('passes a fixed deltaSeconds of 1/tickRateHz to every tick', () => {
      const loop = new TickLoop(20);
      const tick = jest.fn();
      loop.register(fakeMatch('m1', tick));
      loop.start();
      jest.advanceTimersByTime(50);
      loop.stop();
      expect(tick).toHaveBeenCalledWith(0.05);
    });
  });

  describe('CRITICAL CHECKPOINT — per-match isolation (R5.4, 3.6.2)', () => {
    it('one match throwing during tick() does not stop other matches from ticking, across multiple cycles', () => {
      const loop = new TickLoop(20);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const healthyTick = jest.fn();
      const throwingTick = jest.fn(() => {
        throw new Error('simulated bug in this match only');
      });

      loop.register(fakeMatch('broken', throwingTick));
      loop.register(fakeMatch('healthy', healthyTick));
      loop.start();

      jest.advanceTimersByTime(3 * (1000 / 20));

      expect(throwingTick).toHaveBeenCalledTimes(3);
      expect(healthyTick).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledTimes(3);

      loop.stop();
      errorSpy.mockRestore();
    });

    it('does not rethrow out of onTick even when every registered match throws', () => {
      const loop = new TickLoop(20);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      loop.register(
        fakeMatch('m1', () => {
          throw new Error('boom');
        }),
      );
      expect(() => {
        loop.start();
        jest.advanceTimersByTime(1000 / 20);
      }).not.toThrow();
      loop.stop();
      errorSpy.mockRestore();
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest --coverage
--collectCoverageFrom="src/model/*.ts"` for the whole `model/` directory — validated result: 60 tests
passing across `ParticipantState`/`MatchModel`/`TickLoop` together, no conflicts. `MatchmakingQueue`/
`QueueEntry` will still show 0% coverage — that's `09_server_1`, a separate (generated) prompt, not this
one. Same `server` branch, commit `Step 9: TickLoop implementation and tests — server model package
complete`, push, open/update the PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: The two CRITICAL CHECKPOINT tests above are the actual point of this whole class — if you
change the implementation for any reason, re-run those two specifically and confirm they still pass before
committing. A TickLoop that doesn't isolate match failures is worse than no TickLoop at all.**
