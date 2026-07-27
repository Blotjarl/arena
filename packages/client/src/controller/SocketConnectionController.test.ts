import { Team, EndReason, MatchPhase } from '@arena/shared';
import { SocketConnectionController } from './SocketConnectionController';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { Socket } from 'socket.io-client';

function makeFakeSocket() {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const socket = {
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: jest.fn(),
  };
  return { socket: socket as unknown as Socket, handlers, emit: socket.emit };
}

function makeModels() {
  return { identity: new ClientIdentityModel(), queue: new ClientQueueModel(), match: new ClientMatchModel() };
}

describe('SocketConnectionController', () => {
  describe('operation', () => {
    it('emits the action and payload on the underlying socket', () => {
      const { socket, emit } = makeFakeSocket();
      const controller = new SocketConnectionController(socket, makeModels());

      controller.operation('queue:join', { foo: 'bar' });

      expect(emit).toHaveBeenCalledWith('queue:join', { foo: 'bar' });
    });

    it('emits with no payload when none is given', () => {
      const { socket, emit } = makeFakeSocket();
      const controller = new SocketConnectionController(socket, makeModels());

      controller.operation('queue:cancel');

      expect(emit).toHaveBeenCalledWith('queue:cancel', undefined);
    });
  });

  describe('bindInboundEvents (exercised via construction)', () => {
    it('registers a listener for every inbound server event exactly once', () => {
      const { socket, handlers } = makeFakeSocket();
      new SocketConnectionController(socket, makeModels());

      for (const event of [
        'queue:joined',
        'queue:cancelled',
        'match:found',
        'champion:selected',
        'match:start',
        'match:state',
        'match:end',
      ]) {
        expect(handlers.has(event)).toBe(true);
      }
    });

    it('routes queue:joined to ClientQueueModel.setQueued', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);

      handlers.get('queue:joined')!({ position: 4 });

      expect(models.queue.status).toBe('queued');
      expect(models.queue.position).toBe(4);
    });

    it('routes queue:cancelled to ClientQueueModel.setCancelled', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      models.queue.setQueued(2);
      new SocketConnectionController(socket, models);

      handlers.get('queue:cancelled')!({});

      expect(models.queue.status).toBe('idle');
      expect(models.queue.position).toBeNull();
    });

    it('routes match:found to ClientQueueModel.setMatched', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const payload = { matchId: 'm1', team: Team.A, opponentUsername: 'Bob', roster: [] };

      handlers.get('match:found')!(payload);

      expect(models.queue.status).toBe('matched');
      expect(models.queue.matchPayload).toBe(payload);
    });

    it('routes champion:selected to ClientMatchModel.applyChampionSelected', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const payload = { matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: false };

      handlers.get('champion:selected')!(payload);

      expect(models.match.championSelection).toBe(payload);
    });

    it('routes match:start to ClientMatchModel.applyMatchStart', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const initialState = { matchId: 'm1', tick: 0, participants: [] };

      handlers.get('match:start')!({ matchId: 'm1', initialState });

      expect(models.match.matchId).toBe('m1');
      expect(models.match.phase).toBe(MatchPhase.ACTIVE);
      expect(models.match.latestState).toBe(initialState);
    });

    it('routes match:state to ClientMatchModel.applyMatchState', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const state = { matchId: 'm1', tick: 5, participants: [] };

      handlers.get('match:state')!(state);

      expect(models.match.latestState).toBe(state);
    });

    it('routes match:end to ClientMatchModel.applyMatchEnd', () => {
      const { socket, handlers } = makeFakeSocket();
      const models = makeModels();
      new SocketConnectionController(socket, models);
      const payload = { matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 1000 };

      handlers.get('match:end')!(payload);

      expect(models.match.result).toBe(payload);
    });
  });
});
