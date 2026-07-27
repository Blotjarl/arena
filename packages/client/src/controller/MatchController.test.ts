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
