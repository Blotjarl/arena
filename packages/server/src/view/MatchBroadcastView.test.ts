import { ModelEvent, ModelListener } from '@arena/shared';
import { MatchBroadcastView } from './MatchBroadcastView';
import type { MatchModel } from '../model/MatchModel';
import type { Socket } from 'socket.io';

function makeMatch(): MatchModel & { listener: ModelListener } {
  let listener: ModelListener;
  return {
    id: 'm1',
    addModelListener: (l: ModelListener) => {
      listener = l;
    },
    get listener() {
      return listener;
    },
  } as unknown as MatchModel & { listener: ModelListener };
}

function makeSocket(): Socket & { emit: jest.Mock } {
  return { emit: jest.fn() } as unknown as Socket & { emit: jest.Mock };
}

function twoSockets() {
  const p1 = makeSocket();
  const p2 = makeSocket();
  const sockets = new Map([
    ['p1', p1],
    ['p2', p2],
  ]);
  return { p1, p2, sockets };
}

describe('MatchBroadcastView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the model', () => {
      const match = makeMatch();
      const view = new MatchBroadcastView(match, new Map());
      expect(match.listener).toBe(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the underlying model', () => {
      const match = makeMatch();
      const view = new MatchBroadcastView(match, new Map());
      expect(view.getModel()).toBe(match);
      const other = makeMatch();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it('broadcasts champion:selected to both participants', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: false };
      view.modelChanged(new ModelEvent(makeMatch(), 'champion:selected', payload));
      expect(p1.emit).toHaveBeenCalledWith('champion:selected', payload);
      expect(p2.emit).toHaveBeenCalledWith('champion:selected', payload);
    });

    it('broadcasts match:start to both participants', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { matchId: 'm1', initialState: { matchId: 'm1', tick: 0, participants: [] } };
      view.modelChanged(new ModelEvent(makeMatch(), 'match:start', payload));
      expect(p1.emit).toHaveBeenCalledWith('match:start', payload);
      expect(p2.emit).toHaveBeenCalledWith('match:start', payload);
    });

    it("translates the model's internal 'state' event type to the wire event match:state", () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const snapshot = { matchId: 'm1', tick: 5, participants: [] };
      view.modelChanged(new ModelEvent(makeMatch(), 'state', snapshot));
      expect(p1.emit).toHaveBeenCalledWith('match:state', snapshot);
      expect(p2.emit).toHaveBeenCalledWith('match:state', snapshot);
    });

    it('broadcasts match:end to both participants', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { matchId: 'm1', reason: 'ELIMINATION', winningTeam: 'A', durationMs: 1000 };
      view.modelChanged(new ModelEvent(makeMatch(), 'match:end', payload));
      expect(p1.emit).toHaveBeenCalledWith('match:end', payload);
      expect(p2.emit).toHaveBeenCalledWith('match:end', payload);
    });

    it("translates 'player_disconnected' to match:player_disconnected, broadcast to both", () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { playerId: 'p1', gracePeriodSeconds: 30 };
      view.modelChanged(new ModelEvent(makeMatch(), 'player_disconnected', payload));
      expect(p1.emit).toHaveBeenCalledWith('match:player_disconnected', payload);
      expect(p2.emit).toHaveBeenCalledWith('match:player_disconnected', payload);
    });

    it("translates 'player_reconnected' to match:player_reconnected, broadcast to both", () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { playerId: 'p1' };
      view.modelChanged(new ModelEvent(makeMatch(), 'player_reconnected', payload));
      expect(p1.emit).toHaveBeenCalledWith('match:player_reconnected', payload);
      expect(p2.emit).toHaveBeenCalledWith('match:player_reconnected', payload);
    });

    it('emits error only to the named player, stripped of the routing playerId', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      view.modelChanged(
        new ModelEvent(makeMatch(), 'error', { playerId: 'p1', code: 'INVALID_CHAMPION_SELECTION', message: 'nope' }),
      );
      expect(p1.emit).toHaveBeenCalledWith('error', { code: 'INVALID_CHAMPION_SELECTION', message: 'nope' });
      expect(p2.emit).not.toHaveBeenCalled();
    });

    it('does nothing for an unrecognized event type', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      expect(() => view.modelChanged(new ModelEvent(makeMatch(), 'unknown', {}))).not.toThrow();
      expect(p1.emit).not.toHaveBeenCalled();
      expect(p2.emit).not.toHaveBeenCalled();
    });
  });

  describe('getController / setController', () => {
    it('are not applicable and throw NotImplementedError', () => {
      const view = new MatchBroadcastView(makeMatch(), new Map());
      expect(() => view.getController()).toThrow();
      expect(() => view.setController()).toThrow();
    });
  });
});
