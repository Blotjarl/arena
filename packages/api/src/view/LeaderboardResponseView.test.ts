import { LeaderboardEntry } from '../model/LeaderboardEntry';
import { LeaderboardResponseView } from './LeaderboardResponseView';

describe('LeaderboardResponseView', () => {
  describe('render', () => {
    it('maps each LeaderboardEntry to a LeaderboardEntryDTO, dropping playerId', () => {
      const view = new LeaderboardResponseView();
      const entry = new LeaderboardEntry('p1', 'Alice', 7, 3, 0, 10, 0.7);
      const result = view.render([entry]);
      expect(result).toEqual([{ username: 'Alice', wins: 7, losses: 3, draws: 0, gamesPlayed: 10, winRate: 0.7 }]);
      expect(result[0]).not.toHaveProperty('playerId');
    });

    it('returns an empty array for an empty input', () => {
      const view = new LeaderboardResponseView();
      expect(view.render([])).toEqual([]);
    });

    it('preserves input order', () => {
      const view = new LeaderboardResponseView();
      const entries = [
        new LeaderboardEntry('p1', 'Alice', 7, 3, 0, 10, 0.7),
        new LeaderboardEntry('p2', 'Bob', 2, 8, 0, 10, 0.2),
      ];
      const result = view.render(entries);
      expect(result.map((r) => r.username)).toEqual(['Alice', 'Bob']);
    });
  });
});
