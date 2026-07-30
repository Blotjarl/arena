import { LeaderboardEntryDTO, ChampionWinRateDTO } from '@arena/shared';
import { LeaderboardController } from './LeaderboardController';
import { ClientLeaderboardModel } from '../model/ClientLeaderboardModel';
import type { LeaderboardView } from '../view/LeaderboardView';

const ENTRIES: LeaderboardEntryDTO[] = [
  { username: 'Alice', wins: 3, losses: 1, draws: 0, gamesPlayed: 4, winRate: 0.75 },
];
const CHAMPION_WIN_RATES: ChampionWinRateDTO[] = [{ championId: 'vex', gamesPlayed: 10, winRate: 0.5 }];

function makeView(): LeaderboardView {
  return {} as unknown as LeaderboardView;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('LeaderboardController', () => {
  describe('operation', () => {
    it('ignores any action other than "refresh"', () => {
      const model = new ClientLeaderboardModel();
      const fetchImpl = jest.fn();
      const controller = new LeaderboardController(model, makeView(), 'http://api.test', fetchImpl);

      controller.operation('somethingElse');

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('sets loading immediately, synchronously, before the fetch resolves', () => {
      const model = new ClientLeaderboardModel();
      const fetchImpl = jest.fn(() => new Promise<Response>(() => {})); // never resolves
      const controller = new LeaderboardController(model, makeView(), 'http://api.test', fetchImpl);

      controller.operation('refresh');

      expect(model.loading).toBe(true);
    });

    it('fetches both /leaderboard and /leaderboard/champions against the configured base URL', () => {
      const model = new ClientLeaderboardModel();
      const fetchImpl = jest.fn(() => new Promise<Response>(() => {}));
      const controller = new LeaderboardController(model, makeView(), 'http://api.test', fetchImpl);

      controller.operation('refresh');

      expect(fetchImpl).toHaveBeenCalledWith('http://api.test/leaderboard');
      expect(fetchImpl).toHaveBeenCalledWith('http://api.test/leaderboard/champions');
    });

    it('CRITICAL CHECKPOINT: on success, loads both DTO arrays onto the model unmodified', async () => {
      const model = new ClientLeaderboardModel();
      const fetchImpl = jest.fn((url: string) => {
        if (url.endsWith('/leaderboard')) return Promise.resolve(jsonResponse(ENTRIES));
        return Promise.resolve(jsonResponse(CHAMPION_WIN_RATES));
      });
      const controller = new LeaderboardController(model, makeView(), 'http://api.test', fetchImpl as unknown as typeof fetch);

      controller.operation('refresh');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(model.entries).toEqual(ENTRIES);
      expect(model.championWinRates).toEqual(CHAMPION_WIN_RATES);
      expect(model.loading).toBe(false);
      expect(model.error).toBeNull();
    });

    it('CRITICAL: a non-ok response routes to setError, not an unhandled rejection or a silent no-op', async () => {
      const model = new ClientLeaderboardModel();
      const fetchImpl = jest.fn((url: string) => {
        if (url.endsWith('/leaderboard')) return Promise.resolve(jsonResponse(null, false, 500));
        return Promise.resolve(jsonResponse(CHAMPION_WIN_RATES));
      });
      const controller = new LeaderboardController(model, makeView(), 'http://api.test', fetchImpl as unknown as typeof fetch);

      controller.operation('refresh');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(model.error).not.toBeNull();
      expect(model.loading).toBe(false);
      expect(model.entries).toBeNull();
    });

    it('CRITICAL: a rejected fetch (network error) routes to setError, not an unhandled rejection', async () => {
      const model = new ClientLeaderboardModel();
      const fetchImpl = jest.fn(() => Promise.reject(new Error('network down')));
      const controller = new LeaderboardController(model, makeView(), 'http://api.test', fetchImpl as unknown as typeof fetch);

      controller.operation('refresh');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(model.error).toBe('network down');
      expect(model.loading).toBe(false);
    });

    it('falls back to a generic message when the rejection is a non-Error value', async () => {
      const model = new ClientLeaderboardModel();
      const fetchImpl = jest.fn(() => Promise.reject('a plain string rejection'));
      const controller = new LeaderboardController(model, makeView(), 'http://api.test', fetchImpl as unknown as typeof fetch);

      controller.operation('refresh');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(model.error).toBe('Failed to load leaderboard');
    });

    it('a failed refresh after a previous success leaves the previously-loaded data in place', async () => {
      const model = new ClientLeaderboardModel();
      model.setLoaded(ENTRIES, CHAMPION_WIN_RATES);
      const fetchImpl = jest.fn(() => Promise.reject(new Error('network down')));
      const controller = new LeaderboardController(model, makeView(), 'http://api.test', fetchImpl as unknown as typeof fetch);

      controller.operation('refresh');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(model.entries).toEqual(ENTRIES);
      expect(model.championWinRates).toEqual(CHAMPION_WIN_RATES);
      expect(model.error).toBe('network down');
    });
  });
});
