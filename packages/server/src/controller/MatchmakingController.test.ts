import { AlreadyQueuedError, NotQueuedError, Team, ModelEvent, Player, ModelListener } from '@arena/shared';
import { MatchmakingController } from './MatchmakingController';
import { MatchModel } from '../model/MatchModel';
import { TickLoop } from '../model/TickLoop';
import type { MatchmakingQueue } from '../model/MatchmakingQueue';
import type { MatchmakingBroadcastView } from '../view/MatchmakingBroadcastView';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';
import type { Socket } from 'socket.io';
import { QueueEntry } from '../model/QueueEntry';

function makeQueue(overrides: Partial<MatchmakingQueue> = {}): MatchmakingQueue {
  return {
    join: jest.fn(),
    cancel: jest.fn(),
    tryPairNext: jest.fn(() => null),
    ...overrides,
  } as unknown as MatchmakingQueue;
}

function makeView(): MatchmakingBroadcastView & { modelChanged: jest.Mock } {
  return { modelChanged: jest.fn() } as unknown as MatchmakingBroadcastView & { modelChanged: jest.Mock };
}

function makeSockets(): Map<string, Socket> {
  return new Map([
    ['p1', { emit: jest.fn() } as unknown as Socket],
    ['p2', { emit: jest.fn() } as unknown as Socket],
  ]);
}

describe('MatchmakingController', () => {
  describe('queue:join', () => {
    it('delegates to MatchmakingQueue.join and does nothing further when no pairing occurs', () => {
      const queue = makeQueue();
      const view = makeView();
      const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
      const onMatchCreated = jest.fn();
      const controller = new MatchmakingController(queue, view, tickLoop, makeSockets(), onMatchCreated);

      const player = new Player('p1', 'Alice', new Date());
      controller.operation('queue:join', { player });

      expect(queue.join).toHaveBeenCalledWith(player);
      expect(tickLoop.register).not.toHaveBeenCalled();
      expect(onMatchCreated).not.toHaveBeenCalled();
      expect(view.modelChanged).not.toHaveBeenCalled();
    });

    it('propagates AlreadyQueuedError uncaught', () => {
      const queue = makeQueue({
        join: jest.fn(() => {
          throw new AlreadyQueuedError('p1');
        }),
      });
      const controller = new MatchmakingController(
        queue,
        makeView(),
        { register: jest.fn() } as unknown as TickLoop,
        makeSockets(),
        jest.fn(),
      );
      expect(() => controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) })).toThrow(
        AlreadyQueuedError,
      );
    });

    describe('CRITICAL CHECKPOINT — on a successful pairing, builds a real MatchModel and registers it with TickLoop', () => {
      it('constructs one MatchModel, registers it with TickLoop exactly once, and wires the two participants', () => {
        const pair: [QueueEntry, QueueEntry] = [new QueueEntry('p1', 'Alice', 1000), new QueueEntry('p2', 'Bob', 1001)];
        const queue = makeQueue({ tryPairNext: jest.fn(() => pair) });
        const view = makeView();
        const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
        const onMatchCreated = jest.fn();
        const sockets = makeSockets();
        const controller = new MatchmakingController(queue, view, tickLoop, sockets, onMatchCreated);

        controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) });

        expect(tickLoop.register).toHaveBeenCalledTimes(1);
        const registeredMatch = (tickLoop.register as jest.Mock).mock.calls[0][0] as MatchModel;
        expect(registeredMatch).toBeInstanceOf(MatchModel);

        expect(onMatchCreated).toHaveBeenCalledTimes(1);
        const [playerIds, match, matchView] = onMatchCreated.mock.calls[0];
        expect(playerIds).toEqual(['p1', 'p2']);
        expect(match).toBe(registeredMatch);
        expect(matchView.getModel()).toBe(match);
      });

      it('assigns Team A to the first-paired entry and Team B to the second, and broadcasts match:found to each with the correct opponent', () => {
        const pair: [QueueEntry, QueueEntry] = [new QueueEntry('p1', 'Alice', 1000), new QueueEntry('p2', 'Bob', 1001)];
        const queue = makeQueue({ tryPairNext: jest.fn(() => pair) });
        const view = makeView();
        const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
        const controller = new MatchmakingController(queue, view, tickLoop, makeSockets(), jest.fn());

        controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) });

        expect(view.modelChanged).toHaveBeenCalledTimes(2);
        const events = view.modelChanged.mock.calls.map((c) => c[0] as ModelEvent);
        expect(events.every((e) => e.type === 'match:found')).toBe(true);

        const forA = events.find((e) => (e.payload as { playerId: string }).playerId === 'p1')!.payload as any;
        const forB = events.find((e) => (e.payload as { playerId: string }).playerId === 'p2')!.payload as any;
        expect(forA.team).toBe(Team.A);
        expect(forA.opponentUsername).toBe('Bob');
        expect(forB.team).toBe(Team.B);
        expect(forB.opponentUsername).toBe('Alice');
        expect(forA.matchId).toBe(forB.matchId);
        expect(forA.roster.length).toBeGreaterThan(0);
      });

      it('CRITICAL CHECKPOINT: unregisters the match from TickLoop once it ends', () => {
        const addListenerSpy = jest.spyOn(MatchModel.prototype, 'addModelListener');
        const pair: [QueueEntry, QueueEntry] = [new QueueEntry('p1', 'Alice', 1000), new QueueEntry('p2', 'Bob', 1001)];
        const queue = makeQueue({ tryPairNext: jest.fn(() => pair) });
        const view = makeView();
        const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
        const onMatchCreated = jest.fn();
        const controller = new MatchmakingController(queue, view, tickLoop, makeSockets(), onMatchCreated);

        controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) });
        const match = (tickLoop.register as jest.Mock).mock.calls[0][0] as MatchModel;

        // The real MatchBroadcastView (constructed inside createMatch) also registers itself as a listener
        // via addModelListener(this) — its own modelChanged is still an unimplemented stub (10_server_7),
        // so it must never be invoked here. Identify it via the view captured by onMatchCreated, and find
        // MatchmakingController's own cleanup listener by elimination — the other registered listener.
        const matchBroadcastView = onMatchCreated.mock.calls[0][2] as MatchBroadcastView;
        const registeredListeners = addListenerSpy.mock.calls.map(([listener]) => listener);
        expect(registeredListeners).toContain(matchBroadcastView);

        const cleanupListener = registeredListeners.find((listener) => listener !== matchBroadcastView) as
          | ModelListener
          | undefined;
        expect(cleanupListener).toBeDefined();

        cleanupListener!.modelChanged(new ModelEvent(match, 'match:end', {}));
        expect(tickLoop.unregister).toHaveBeenCalledWith(match.id);

        // A non-'match:end' event must not trigger unregistration.
        (tickLoop.unregister as jest.Mock).mockClear();
        cleanupListener!.modelChanged(new ModelEvent(match, 'state', {}));
        expect(tickLoop.unregister).not.toHaveBeenCalled();

        addListenerSpy.mockRestore();
      });
    });
  });

  describe('queue:cancel', () => {
    it('delegates to MatchmakingQueue.cancel with the requesting player id', () => {
      const queue = makeQueue();
      const controller = new MatchmakingController(
        queue,
        makeView(),
        { register: jest.fn() } as unknown as TickLoop,
        makeSockets(),
        jest.fn(),
      );
      controller.operation('queue:cancel', { player: new Player('p1', 'Alice', new Date()) });
      expect(queue.cancel).toHaveBeenCalledWith('p1');
    });

    it('propagates NotQueuedError uncaught', () => {
      const queue = makeQueue({
        cancel: jest.fn(() => {
          throw new NotQueuedError('p1');
        }),
      });
      const controller = new MatchmakingController(
        queue,
        makeView(),
        { register: jest.fn() } as unknown as TickLoop,
        makeSockets(),
        jest.fn(),
      );
      expect(() => controller.operation('queue:cancel', { player: new Player('p1', 'Alice', new Date()) })).toThrow(
        NotQueuedError,
      );
    });
  });
});
