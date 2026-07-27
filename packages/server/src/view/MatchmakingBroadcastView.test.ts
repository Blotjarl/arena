import { ModelEvent, ModelListener } from '@arena/shared';
import { MatchmakingBroadcastView } from './MatchmakingBroadcastView';
import type { MatchmakingQueue } from '../model/MatchmakingQueue';
import type { Socket } from 'socket.io';

function makeQueue(): MatchmakingQueue & { listener: ModelListener } {
  let listener: ModelListener;
  return {
    addModelListener: (l: ModelListener) => {
      listener = l;
    },
    get listener() {
      return listener;
    },
  } as unknown as MatchmakingQueue & { listener: ModelListener };
}

function makeSocket(): Socket & { emit: jest.Mock } {
  return { emit: jest.fn() } as unknown as Socket & { emit: jest.Mock };
}

describe('MatchmakingBroadcastView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the model', () => {
      const queue = makeQueue();
      const view = new MatchmakingBroadcastView(queue, new Map());
      expect(queue.listener).toBe(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the underlying model', () => {
      const queue = makeQueue();
      const view = new MatchmakingBroadcastView(queue, new Map());
      expect(view.getModel()).toBe(queue);
      const other = makeQueue();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it("emits queue:joined with just {position} to the joining player's socket only", () => {
      const queue = makeQueue();
      const p1Socket = makeSocket();
      const p2Socket = makeSocket();
      const sockets = new Map([
        ['p1', p1Socket],
        ['p2', p2Socket],
      ]);
      const view = new MatchmakingBroadcastView(queue, sockets);
      view.modelChanged(new ModelEvent(queue, 'queue:joined', { playerId: 'p1', position: 3 }));
      expect(p1Socket.emit).toHaveBeenCalledWith('queue:joined', { position: 3 });
      expect(p2Socket.emit).not.toHaveBeenCalled();
    });

    it('emits queue:cancelled with no fields to the cancelling player only', () => {
      const queue = makeQueue();
      const p1Socket = makeSocket();
      const sockets = new Map([['p1', p1Socket]]);
      const view = new MatchmakingBroadcastView(queue, sockets);
      view.modelChanged(new ModelEvent(queue, 'queue:cancelled', { playerId: 'p1' }));
      expect(p1Socket.emit).toHaveBeenCalledWith('queue:cancelled', {});
    });

    it("emits match:found with the per-player payload, stripped of the routing playerId, to that player's socket only", () => {
      const queue = makeQueue();
      const p1Socket = makeSocket();
      const p2Socket = makeSocket();
      const sockets = new Map([
        ['p1', p1Socket],
        ['p2', p2Socket],
      ]);
      const view = new MatchmakingBroadcastView(queue, sockets);
      view.modelChanged(
        new ModelEvent(queue, 'match:found', {
          playerId: 'p1',
          matchId: 'm1',
          team: 'A',
          opponentUsername: 'Bob',
          roster: [],
        }),
      );
      expect(p1Socket.emit).toHaveBeenCalledWith('match:found', {
        matchId: 'm1',
        team: 'A',
        opponentUsername: 'Bob',
        roster: [],
      });
      expect(p2Socket.emit).not.toHaveBeenCalled();
    });

    it('does nothing for an unrecognized event type', () => {
      const queue = makeQueue();
      const socket = makeSocket();
      const view = new MatchmakingBroadcastView(queue, new Map([['p1', socket]]));
      expect(() => view.modelChanged(new ModelEvent(queue, 'unknown', {}))).not.toThrow();
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('is a no-op (does not throw) when the target player has no registered socket', () => {
      const queue = makeQueue();
      const view = new MatchmakingBroadcastView(queue, new Map());
      expect(() =>
        view.modelChanged(new ModelEvent(queue, 'queue:joined', { playerId: 'ghost', position: 1 })),
      ).not.toThrow();
    });
  });

  describe('getController / setController', () => {
    it('are not applicable and throw NotImplementedError', () => {
      const view = new MatchmakingBroadcastView(makeQueue(), new Map());
      expect(() => view.getController()).toThrow();
      expect(() => view.setController()).toThrow();
    });
  });
});
