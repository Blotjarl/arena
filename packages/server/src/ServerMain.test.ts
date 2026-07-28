import { ServerMain, rebindIfInMatch } from './ServerMain';
import type { ConnectionHandler } from './controller/ConnectionHandler';
import type { MatchRegistryEntry } from './controller/MatchmakingController';
import type { MatchModel } from './model/MatchModel';
import type { MatchBroadcastView } from './view/MatchBroadcastView';

describe('ServerMain', () => {
  describe('main', () => {
    it('starts listening on a free port without throwing (smoke test — see class doc comment)', async () => {
      await expect(ServerMain.main(0)).resolves.toBeUndefined();
    });
  });

  describe('rebindIfInMatch', () => {
    it('CRITICAL CHECKPOINT (R6.1-R6.4 reconnection): binds a fresh ConnectionHandler to its still-active match when a registry entry exists', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const match = {} as MatchModel;
      const view = {} as MatchBroadcastView;
      const registry = new Map<string, MatchRegistryEntry>([['p1', { match, view }]]);

      rebindIfInMatch(handler, registry, 'p1');

      expect(handler.bindMatch).toHaveBeenCalledWith(match, view);
    });

    it('CRITICAL CHECKPOINT (dead-match trace): does not rebind a player with no registry entry (already-ended match or never paired)', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const registry = new Map<string, MatchRegistryEntry>();

      rebindIfInMatch(handler, registry, 'p1');

      expect(handler.bindMatch).not.toHaveBeenCalled();
    });

    it('only rebinds the matching playerId, ignoring other entries in a multi-match registry', () => {
      const handler = { bindMatch: jest.fn() } as unknown as ConnectionHandler;
      const otherMatch = {} as MatchModel;
      const otherView = {} as MatchBroadcastView;
      const registry = new Map<string, MatchRegistryEntry>([['p2', { match: otherMatch, view: otherView }]]);

      rebindIfInMatch(handler, registry, 'p1');

      expect(handler.bindMatch).not.toHaveBeenCalled();
    });
  });
});
