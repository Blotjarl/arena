import { InvalidUsernameError, AlreadyQueuedError, NotQueuedError, InvalidMatchPhaseError, GracePeriodExpiredError } from '@arena/shared';
import { ConnectionHandler } from './ConnectionHandler';
import type { PlayerIdentifyController } from './PlayerIdentifyController';
import type { MatchmakingController } from './MatchmakingController';
import type { MatchModel } from '../model/MatchModel';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';
import type { Socket } from 'socket.io';

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

describe('ConnectionHandler', () => {
  describe('identify', () => {
    it('on success, marks the connection identified, invokes onIdentified once, and emits nothing', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const onIdentified = jest.fn();
      const conn = new ConnectionHandler(socket, { identify, matchmaking }, onIdentified);
      conn.register();

      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });
      expect(identify.operation).toHaveBeenCalledWith('identify', { playerId: 'p1', username: 'Alice' });
      expect(onIdentified).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', username: 'Alice' }));
      expect(emit).not.toHaveBeenCalled();

      // Now identified: queue:join should reach the matchmaking controller instead of erroring.
      handlers.get('queue:join')!();
      expect(matchmaking.operation).toHaveBeenCalledWith('queue:join', {
        player: expect.objectContaining({ id: 'p1', username: 'Alice' }),
      });
    });

    it('on InvalidUsernameError, emits a matching error event and leaves the connection unidentified', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = {
        operation: jest.fn(() => {
          throw new InvalidUsernameError('');
        }),
      } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const onIdentified = jest.fn();
      const conn = new ConnectionHandler(socket, { identify, matchmaking }, onIdentified);
      conn.register();

      handlers.get('identify')!({ playerId: 'p1', username: '' });
      expect(emit).toHaveBeenCalledWith('error', { code: 'INVALID_USERNAME', message: expect.any(String) });
      expect(onIdentified).not.toHaveBeenCalled();

      handlers.get('queue:join')!();
      expect(matchmaking.operation).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith('error', { code: 'UNIDENTIFIED_CONNECTION', message: expect.any(String) });
    });
  });

  describe('events before identify', () => {
    it('gates queue:join/queue:cancel/champion:select/match:reconnect behind UnidentifiedConnectionError', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();

      for (const event of ['queue:join', 'queue:cancel', 'champion:select', 'match:reconnect']) {
        emit.mockClear();
        handlers.get(event)!({});
        expect(emit).toHaveBeenCalledWith('error', { code: 'UNIDENTIFIED_CONNECTION', message: expect.any(String) });
      }
      expect(matchmaking.operation).not.toHaveBeenCalled();
    });

    it('silently ignores match:action and the raw disconnect event before identify (no error emitted)', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();

      handlers.get('match:action')!({ dx: 1, dy: 0 });
      expect(emit).not.toHaveBeenCalled();
      handlers.get('disconnect')!();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('queue:join / queue:cancel', () => {
    it('propagates controller exceptions as a targeted error event', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = {
        operation: jest.fn(() => {
          throw new AlreadyQueuedError('p1');
        }),
      } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });

      handlers.get('queue:join')!();
      expect(emit).toHaveBeenCalledWith('error', { code: 'ALREADY_QUEUED', message: expect.any(String) });
    });

    it('queue:cancel also propagates controller exceptions as a targeted error event', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = {
        operation: jest.fn(() => {
          throw new NotQueuedError('p1');
        }),
      } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });

      handlers.get('queue:cancel')!();
      expect(emit).toHaveBeenCalledWith('error', { code: 'NOT_QUEUED', message: expect.any(String) });
    });

    it('re-throws a non-ArenaError rather than swallowing it as a socket error event', () => {
      const { socket, handlers } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = {
        operation: jest.fn(() => {
          throw new Error('programming bug');
        }),
      } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });

      expect(() => handlers.get('queue:join')!()).toThrow('programming bug');
    });
  });

  describe('disconnect while identified but not yet matched (CORRECTION, Step 11)', () => {
    it('cancels the player\'s queue entry so it is not left orphaned for a later tryPairNext() to pair against a dead socket', () => {
      const { socket, handlers } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });

      handlers.get('disconnect')!();

      expect(matchmaking.operation).toHaveBeenCalledWith('queue:cancel', {
        player: expect.objectContaining({ id: 'p1', username: 'Alice' }),
      });
    });

    it('swallows NotQueuedError rather than throwing (e.g. disconnecting between identify and queue:join)', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = {
        operation: jest.fn(() => {
          throw new NotQueuedError('p1');
        }),
      } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });

      expect(() => handlers.get('disconnect')!()).not.toThrow();
      expect(emit).not.toHaveBeenCalledWith('error', expect.anything());
    });
  });

  describe('bindMatch and match-scoped dispatch', () => {
    function identifiedConnection() {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });
      return { conn, handlers, emit };
    }

    it('before bindMatch, silently ignores champion:select and match:action (no error, no throw)', () => {
      const { handlers, emit } = identifiedConnection();
      expect(() => handlers.get('champion:select')!({ championId: 'vex' })).not.toThrow();
      expect(() => handlers.get('match:action')!({ dx: 1, dy: 0 })).not.toThrow();
      expect(emit).not.toHaveBeenCalled();
    });

    it('after bindMatch, forwards champion:select with the connection playerId injected', () => {
      const { conn, handlers } = identifiedConnection();
      const spyMatch = { selectChampion: jest.fn() } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('champion:select')!({ championId: 'vex' });
      expect((spyMatch as any).selectChampion).toHaveBeenCalledWith('p1', 'vex');
    });

    it('after bindMatch, surfaces an InvalidMatchPhaseError from champion:select as an error event (the one case ChampionSelectController lets propagate)', () => {
      const { conn, handlers, emit } = identifiedConnection();
      const spyMatch = {
        selectChampion: jest.fn(() => {
          throw new InvalidMatchPhaseError('m1', 'CHAMPION_SELECT', 'ACTIVE');
        }),
      } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('champion:select')!({ championId: 'vex' });
      expect(emit).toHaveBeenCalledWith('error', { code: 'INVALID_MATCH_PHASE', message: expect.any(String) });
    });

    it('after bindMatch, forwards match:action with the connection playerId injected', () => {
      const { conn, handlers } = identifiedConnection();
      const spyMatch = { submitMove: jest.fn(), submitAbility: jest.fn() } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('match:action')!({ dx: 1, dy: 0 });
      expect((spyMatch as any).submitMove).toHaveBeenCalledWith('p1', { dx: 1, dy: 0 });
    });

    it('after bindMatch, forwards match:reconnect and surfaces GracePeriodExpiredError as an error event', () => {
      const { conn, handlers, emit } = identifiedConnection();
      const spyMatch = {
        reconnect: jest.fn(() => {
          throw new GracePeriodExpiredError('p1', 'm1');
        }),
      } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('match:reconnect')!();
      expect(emit).toHaveBeenCalledWith('error', { code: 'GRACE_PERIOD_EXPIRED', message: expect.any(String) });
    });

    it('after bindMatch, the raw socket disconnect event forwards to DisconnectController', () => {
      const { conn, handlers } = identifiedConnection();
      const spyMatch = { disconnect: jest.fn() } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('disconnect')!();
      expect((spyMatch as any).disconnect).toHaveBeenCalledWith('p1');
    });
  });
});
