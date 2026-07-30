import { ClientLeaderboardModel } from '../ClientLeaderboardModel';
import { LeaderboardEntryDTO, ChampionWinRateDTO } from '@arena/shared';

const makeEntries = (): LeaderboardEntryDTO[] => [
  { username: 'Alice', wins: 3, losses: 1, draws: 0, gamesPlayed: 4, winRate: 0.75 },
];

const makeChampionWinRates = (): ChampionWinRateDTO[] => [{ championId: 'vex', gamesPlayed: 10, winRate: 0.5 }];

describe('ClientLeaderboardModel', () => {
  it('starts with null entries/championWinRates/error and loading false', () => {
    const m = new ClientLeaderboardModel();
    expect(m.entries).toBeNull();
    expect(m.championWinRates).toBeNull();
    expect(m.error).toBeNull();
    expect(m.loading).toBe(false);
  });

  describe('setLoading()', () => {
    it('sets loading true and clears any previous error', () => {
      const m = new ClientLeaderboardModel();
      m.setError('boom');
      m.setLoading();
      expect(m.loading).toBe(true);
      expect(m.error).toBeNull();
    });

    it('notifies listeners', () => {
      const m = new ClientLeaderboardModel();
      const listener = { modelChanged: jest.fn() };
      m.addModelListener(listener);
      m.setLoading();
      expect(listener.modelChanged).toHaveBeenCalled();
    });
  });

  describe('setLoaded()', () => {
    it('stores both arrays exactly as given, clears loading and error', () => {
      const m = new ClientLeaderboardModel();
      const entries = makeEntries();
      const championWinRates = makeChampionWinRates();
      m.setLoading();
      m.setError('stale error from a previous failed refresh');
      m.setLoaded(entries, championWinRates);
      expect(m.entries).toBe(entries);
      expect(m.championWinRates).toBe(championWinRates);
      expect(m.loading).toBe(false);
      expect(m.error).toBeNull();
    });

    it('notifies listeners', () => {
      const m = new ClientLeaderboardModel();
      const listener = { modelChanged: jest.fn() };
      m.addModelListener(listener);
      m.setLoaded(makeEntries(), makeChampionWinRates());
      expect(listener.modelChanged).toHaveBeenCalled();
    });
  });

  describe('setError()', () => {
    it('sets the error message and clears loading', () => {
      const m = new ClientLeaderboardModel();
      m.setLoading();
      m.setError('Network error');
      expect(m.error).toBe('Network error');
      expect(m.loading).toBe(false);
    });

    it('CRITICAL: does not clear previously-loaded entries/championWinRates on a failed refresh', () => {
      const m = new ClientLeaderboardModel();
      const entries = makeEntries();
      const championWinRates = makeChampionWinRates();
      m.setLoaded(entries, championWinRates);

      m.setLoading();
      m.setError('the refresh failed');

      expect(m.entries).toBe(entries);
      expect(m.championWinRates).toBe(championWinRates);
      expect(m.error).toBe('the refresh failed');
    });

    it('notifies listeners', () => {
      const m = new ClientLeaderboardModel();
      const listener = { modelChanged: jest.fn() };
      m.addModelListener(listener);
      m.setError('boom');
      expect(listener.modelChanged).toHaveBeenCalled();
    });
  });
});
