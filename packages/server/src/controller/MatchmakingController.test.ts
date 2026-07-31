import { AlreadyQueuedError, NotQueuedError, Team, ModelEvent, Player, ModelListener, PlayerId } from '@arena/shared';
import { MatchmakingController, MatchRegistryEntry } from './MatchmakingController';
import { MatchModel } from '../model/MatchModel';
import { TickLoop } from '../model/TickLoop';
import type { MatchmakingQueue } from '../model/MatchmakingQueue';
import type { MatchmakingBroadcastView } from '../view/MatchmakingBroadcastView';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';
import type { Socket } from 'socket.io';
import { QueueEntry } from '../model/QueueEntry';
import type { MatchReportingClient } from './MatchReportingClient';
import { MatchReportingListener } from './MatchReportingListener';

function makeReportingClient(): MatchReportingClient {
  return {
    reportMatchBegin: jest.fn().mockResolvedValue(undefined),
    reportMatchEnd: jest.fn().mockResolvedValue(undefined),
  } as unknown as MatchReportingClient;
}

function makeQueue(overrides: Partial<MatchmakingQueue> = {}): MatchmakingQueue {
  return {
    join: jest.fn(),
    cancel: jest.fn(),
    tryPairNext: jest.fn(() => null),
    releaseMatch: jest.fn(),
    ...overrides,
  } as unknown as MatchmakingQueue;
}

function makeMatchRegistry(): Map<PlayerId, MatchRegistryEntry> {
  return new Map();
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
      const controller = new MatchmakingController(
        queue,
        view,
        tickLoop,
        makeSockets(),
        onMatchCreated,
        makeReportingClient(),
        makeMatchRegistry(),
      );

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
        makeReportingClient(),
        makeMatchRegistry(),
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
        const controller = new MatchmakingController(
          queue,
          view,
          tickLoop,
          sockets,
          onMatchCreated,
          makeReportingClient(),
          makeMatchRegistry(),
        );

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
        const controller = new MatchmakingController(
          queue,
          view,
          tickLoop,
          makeSockets(),
          jest.fn(),
          makeReportingClient(),
          makeMatchRegistry(),
        );

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

      it('CRITICAL CHECKPOINT: unregisters the match from TickLoop, releases the queue slot, and clears the match registry once it ends', () => {
        const addListenerSpy = jest.spyOn(MatchModel.prototype, 'addModelListener');
        const pair: [QueueEntry, QueueEntry] = [new QueueEntry('p1', 'Alice', 1000), new QueueEntry('p2', 'Bob', 1001)];
        const queue = makeQueue({ tryPairNext: jest.fn(() => pair) });
        const view = makeView();
        const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
        const onMatchCreated = jest.fn();
        const matchRegistry = makeMatchRegistry();
        const controller = new MatchmakingController(
          queue,
          view,
          tickLoop,
          makeSockets(),
          onMatchCreated,
          makeReportingClient(),
          matchRegistry,
        );

        controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) });
        const match = (tickLoop.register as jest.Mock).mock.calls[0][0] as MatchModel;

        // Both paired players must already be registered by the time createMatch() returns -- this is what
        // lets ServerMain rebind a reconnecting player's fresh ConnectionHandler before match:reconnect ever
        // arrives.
        expect(matchRegistry.get('p1')).toEqual({
          match,
          view: onMatchCreated.mock.calls[0][2],
          players: [new Player('p1', 'Alice', expect.any(Date)), new Player('p2', 'Bob', expect.any(Date))],
        });
        expect(matchRegistry.get('p2')).toEqual({
          match,
          view: onMatchCreated.mock.calls[0][2],
          players: [new Player('p1', 'Alice', expect.any(Date)), new Player('p2', 'Bob', expect.any(Date))],
        });

        // createMatch() registers three listeners on the new MatchModel: the real MatchBroadcastView (its
        // own modelChanged is still an unimplemented stub, 10_server_7, so it must never be invoked here),
        // a MatchReportingListener (10_server_9 — reports to the api, also not under test here), and
        // MatchmakingController's own anonymous cleanup listener. Identify the cleanup listener by
        // elimination: it's the one registered listener that is neither a MatchBroadcastView nor a
        // MatchReportingListener instance.
        const matchBroadcastView = onMatchCreated.mock.calls[0][2] as MatchBroadcastView;
        const registeredListeners = addListenerSpy.mock.calls.map(([listener]) => listener);
        expect(registeredListeners).toContain(matchBroadcastView);

        const cleanupListener = registeredListeners.find(
          (listener) => listener !== matchBroadcastView && !(listener instanceof MatchReportingListener),
        ) as ModelListener | undefined;
        expect(cleanupListener).toBeDefined();

        // A non-'match:end' event must not trigger any cleanup.
        cleanupListener!.modelChanged(new ModelEvent(match, 'state', {}));
        expect(tickLoop.unregister).not.toHaveBeenCalled();
        expect(queue.releaseMatch).not.toHaveBeenCalled();
        expect(matchRegistry.has('p1')).toBe(true);

        cleanupListener!.modelChanged(new ModelEvent(match, 'match:end', {}));
        expect(tickLoop.unregister).toHaveBeenCalledWith(match.id);
        expect(queue.releaseMatch).toHaveBeenCalledWith(['p1', 'p2']);

        // CRITICAL (ordering trace, see this prompt's closing requirement): the registry entries for both
        // players must be gone the instant 'match:end' has fired -- synchronously, before any later event
        // (like a stray match:reconnect from a disconnected loser) could possibly reach the server and find
        // a stale entry pointing at this now-dead match.
        expect(matchRegistry.has('p1')).toBe(false);
        expect(matchRegistry.has('p2')).toBe(false);

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
        makeReportingClient(),
        makeMatchRegistry(),
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
        makeReportingClient(),
        makeMatchRegistry(),
      );
      expect(() => controller.operation('queue:cancel', { player: new Player('p1', 'Alice', new Date()) })).toThrow(
        NotQueuedError,
      );
    });
  });
});
