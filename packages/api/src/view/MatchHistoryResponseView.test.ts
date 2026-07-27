import { MatchResult, EndReason } from '@arena/shared';
import { MatchHistoryResponseView } from './MatchHistoryResponseView';
import { MatchHistoryRow } from '../model/MatchRepository';

function makeRow(overrides: Partial<MatchHistoryRow> = {}): MatchHistoryRow {
  return {
    matchId: 'match-1',
    opponentUsername: 'Bob',
    championId: 'korr',
    result: MatchResult.WIN,
    endReason: EndReason.ELIMINATION,
    durationMs: 90_000,
    endedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('MatchHistoryResponseView', () => {
  describe('render', () => {
    it('maps each row to a MatchHistoryEntryDTO, converting endedAt to an ISO string', () => {
      const view = new MatchHistoryResponseView();
      const result = view.render([makeRow()]);
      expect(result).toEqual([
        {
          matchId: 'match-1',
          opponentUsername: 'Bob',
          championId: 'korr',
          result: MatchResult.WIN,
          endReason: EndReason.ELIMINATION,
          durationMs: 90_000,
          endedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('returns an empty array for an empty input', () => {
      const view = new MatchHistoryResponseView();
      expect(view.render([])).toEqual([]);
    });

    it('preserves row order and formats multiple rows', () => {
      const view = new MatchHistoryResponseView();
      const rows = [
        makeRow({ matchId: 'match-1', result: MatchResult.WIN }),
        makeRow({ matchId: 'match-2', result: MatchResult.LOSS, opponentUsername: 'Carol' }),
      ];
      const result = view.render(rows);
      expect(result.map((r) => r.matchId)).toEqual(['match-1', 'match-2']);
      expect(result[1].opponentUsername).toBe('Carol');
      expect(result[1].result).toBe(MatchResult.LOSS);
    });
  });
});
