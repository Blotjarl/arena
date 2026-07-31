import { GracePeriodExpiredError, MatchPhase, Player, Team } from '@arena/shared';
import { ServerMain, rebindIfInMatch } from './ServerMain';
import type { ConnectionHandler } from './controller/ConnectionHandler';
import type { MatchRegistryEntry } from './controller/MatchmakingController';
import type { MatchModel } from './model/MatchModel';
import type { MatchBroadcastView } from './view/MatchBroadcastView';

function makePlayers(): [Player, Player] {
  return [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
}

function makeSocket(): { emit: jest.Mock } {
  return { emit: jest.fn() };
}

describe('ServerMain', () => {
  describe('main', () => {
    afterEach(async () => {
      // CORRECTION (Step 11): without this, TickLoop's setInterval (never unref'd, unlike httpServer)
      // keeps the Jest worker process alive after the suite finishes — see ServerMain.stop()'s own doc
      // comment and docs/01_class_list.md's matching Step 11 addition note.
      await ServerMain.stop();
    });

    it('starts listening on a free port without throwing (smoke test — see class doc comment)', async () => {
      await expect(ServerMain.main(0)).resolves.toBeUndefined();
    });

    it('can be stopped and started again cleanly (no leaked port or dangling tick interval)', async () => {
      await ServerMain.main(0);
      await ServerMain.stop();
      await expect(ServerMain.main(0)).resolves.toBeUndefined();
    });
  });

  describe('stop', () => {
    it('is a no-op when main() has not been called', async () => {
      await expect(ServerMain.stop()).resolves.toBeUndefined();
    });
  });

  describe('rebindIfInMatch', () => {
    function makeMatch(overrides: Partial<MatchModel> = {}): MatchModel {
      return {
        id: 'm1',
        reconnect: jest.fn(),
        getRehydrationInfo: jest.fn(() => ({ phase: MatchPhase.ACTIVE, selections: [] })),
        snapshot: jest.fn(() => ({ matchId: 'm1', tick: 1, participants: [] })) as unknown as MatchModel['snapshot'],
        ...overrides,
      } as unknown as MatchModel;
    }

    it('CRITICAL CHECKPOINT (R6.1-R6.4 reconnection): binds a fresh ConnectionHandler to its still-active match when a registry entry exists', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const match = makeMatch();
      const view = {} as MatchBroadcastView;
      const registry = new Map<string, MatchRegistryEntry>([['p1', { match, view, players: makePlayers() }]]);

      rebindIfInMatch(handler, registry, 'p1', makeSocket());

      expect(handler.bindMatch).toHaveBeenCalledWith(match, view);
    });

    it('CRITICAL CHECKPOINT (dead-match trace): does not rebind a player with no registry entry (already-ended match or never paired)', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const registry = new Map<string, MatchRegistryEntry>();

      rebindIfInMatch(handler, registry, 'p1', makeSocket());

      expect(handler.bindMatch).not.toHaveBeenCalled();
    });

    it('only rebinds the matching playerId, ignoring other entries in a multi-match registry', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const otherMatch = makeMatch();
      const otherView = {} as MatchBroadcastView;
      const registry = new Map<string, MatchRegistryEntry>([
        ['p2', { match: otherMatch, view: otherView, players: makePlayers() }],
      ]);

      rebindIfInMatch(handler, registry, 'p1', makeSocket());

      expect(handler.bindMatch).not.toHaveBeenCalled();
    });

    it('CRITICAL CHECKPOINT (reload-reconnect fix): calls match.reconnect() directly, without waiting for a client-emitted match:reconnect', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const match = makeMatch();
      const registry = new Map<string, MatchRegistryEntry>([
        ['p1', { match, view: {} as MatchBroadcastView, players: makePlayers() }],
      ]);

      rebindIfInMatch(handler, registry, 'p1', makeSocket());

      expect(match.reconnect).toHaveBeenCalledWith('p1');
    });

    it('emits a targeted match:found naming the correct team and opponent for each side', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const match = makeMatch();
      const registry = new Map<string, MatchRegistryEntry>([
        ['p1', { match, view: {} as MatchBroadcastView, players: makePlayers() }],
      ]);
      const socket = makeSocket();

      rebindIfInMatch(handler, registry, 'p1', socket);

      expect(socket.emit).toHaveBeenCalledWith(
        'match:found',
        expect.objectContaining({ matchId: 'm1', team: Team.A, opponentUsername: 'Bob' }),
      );
    });

    it('CRITICAL CHECKPOINT: emits match:start with the live snapshot when the match is already ACTIVE', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const liveSnapshot = { matchId: 'm1', tick: 42, participants: [] };
      const match = makeMatch({
        getRehydrationInfo: jest.fn(() => ({ phase: MatchPhase.ACTIVE, selections: [] })),
        snapshot: jest.fn(() => liveSnapshot) as unknown as MatchModel['snapshot'],
      });
      const registry = new Map<string, MatchRegistryEntry>([
        ['p1', { match, view: {} as MatchBroadcastView, players: makePlayers() }],
      ]);
      const socket = makeSocket();

      rebindIfInMatch(handler, registry, 'p1', socket);

      expect(socket.emit).toHaveBeenCalledWith('match:start', { matchId: 'm1', initialState: liveSnapshot });
      expect(socket.emit).not.toHaveBeenCalledWith('champion:selected', expect.anything());
    });

    it('CRITICAL CHECKPOINT: replays champion:selected for an already-made pick instead of match:start when still in CHAMPION_SELECT', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const match = makeMatch({
        getRehydrationInfo: jest.fn(() => ({
          phase: MatchPhase.CHAMPION_SELECT,
          selections: [{ playerId: 'p2', championId: 'vex' }],
        })),
      });
      const registry = new Map<string, MatchRegistryEntry>([
        ['p1', { match, view: {} as MatchBroadcastView, players: makePlayers() }],
      ]);
      const socket = makeSocket();

      rebindIfInMatch(handler, registry, 'p1', socket);

      expect(socket.emit).toHaveBeenCalledWith('champion:selected', {
        matchId: 'm1',
        playerId: 'p2',
        championId: 'vex',
        bothSelected: false,
      });
      expect(socket.emit).not.toHaveBeenCalledWith('match:start', expect.anything());
    });

    it('emits nothing beyond bindMatch when nobody has selected a champion yet', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const match = makeMatch({
        getRehydrationInfo: jest.fn(() => ({ phase: MatchPhase.CHAMPION_SELECT, selections: [] })),
      });
      const registry = new Map<string, MatchRegistryEntry>([
        ['p1', { match, view: {} as MatchBroadcastView, players: makePlayers() }],
      ]);
      const socket = makeSocket();

      rebindIfInMatch(handler, registry, 'p1', socket);

      expect(socket.emit).toHaveBeenCalledTimes(1); // match:found only
      expect(socket.emit).toHaveBeenCalledWith('match:found', expect.anything());
    });

    it('CRITICAL CHECKPOINT: still binds the connection but skips the rehydration replay when the grace period already expired', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const match = makeMatch({
        reconnect: jest.fn(() => {
          throw new GracePeriodExpiredError('p1', 'm1');
        }),
      });
      const view = {} as MatchBroadcastView;
      const registry = new Map<string, MatchRegistryEntry>([['p1', { match, view, players: makePlayers() }]]);
      const socket = makeSocket();

      rebindIfInMatch(handler, registry, 'p1', socket);

      expect(handler.bindMatch).toHaveBeenCalledWith(match, view);
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('lets an unexpected error from match.reconnect() propagate rather than silently swallowing it', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const match = makeMatch({
        reconnect: jest.fn(() => {
          throw new Error('boom');
        }),
      });
      const registry = new Map<string, MatchRegistryEntry>([
        ['p1', { match, view: {} as MatchBroadcastView, players: makePlayers() }],
      ]);

      expect(() => rebindIfInMatch(handler, registry, 'p1', makeSocket())).toThrow('boom');
    });
  });
});
