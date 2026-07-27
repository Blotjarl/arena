import { LeaderboardEntry } from './LeaderboardEntry';

describe('LeaderboardEntry.fromRow', () => {
  it('maps a raw aggregated row (pg-driver string numerics) into a typed entry', () => {
    const entry = LeaderboardEntry.fromRow({
      player_id: 'player-1',
      username: 'Ada',
      wins: '3',
      losses: '1',
      draws: '0',
      games_played: '4',
      win_rate: '0.75',
    });

    expect(entry).toBeInstanceOf(LeaderboardEntry);
    expect(entry.playerId).toBe('player-1');
    expect(entry.username).toBe('Ada');
    expect(entry.wins).toBe(3);
    expect(entry.losses).toBe(1);
    expect(entry.draws).toBe(0);
    expect(entry.gamesPlayed).toBe(4);
    expect(entry.winRate).toBe(0.75);
  });

  it('also accepts already-numeric fields', () => {
    const entry = LeaderboardEntry.fromRow({
      player_id: 'player-2',
      username: 'Bea',
      wins: 0,
      losses: 0,
      draws: 2,
      games_played: 2,
      win_rate: 0,
    });

    expect(entry.wins).toBe(0);
    expect(entry.draws).toBe(2);
    expect(entry.winRate).toBe(0);
  });
});
