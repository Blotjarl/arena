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
