import { Match, MatchParticipant, Team, EndReason, MatchResult } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { MatchRepository } from './MatchRepository';
import { LeaderboardRepository } from './LeaderboardRepository';

// Requires `npm run test:db:up` first -- packages/api/schema.sql is applied automatically via Postgres's
// init-scripts mechanism when the container first starts.
const TEST_CONNECTION_STRING = 'postgresql://arena:arena@localhost:55432/arena_test';

const PLAYER_HIGH_WINRATE = 'leaderboard-test-player-high';
const PLAYER_LOW_GAMES = 'leaderboard-test-player-low-games';
const PLAYER_OPPONENT = 'leaderboard-test-player-opponent';

// Namespaced (not reused by any other integration test file) so computeChampionWinRates' unscoped,
// whole-table aggregate can't pick up rows from a concurrently-running Jest worker's fixtures.
const CHAMPION_HIGH_WINRATE = 'leaderboard-test-champ-high';
const CHAMPION_LOW_GAMES = 'leaderboard-test-champ-low';
const CHAMPION_OPPONENT = 'leaderboard-test-champ-opponent';

describe('LeaderboardRepository (integration — real PostgreSQL)', () => {
  let pool: PgPool;
  let matchRepo: MatchRepository;
  let leaderboardRepo: LeaderboardRepository;

  async function cleanup(): Promise<void> {
    const players = [PLAYER_HIGH_WINRATE, PLAYER_LOW_GAMES, PLAYER_OPPONENT];
    await pool.query('DELETE FROM match_participants WHERE player_id = ANY($1)', [players]);
    await pool.query('DELETE FROM matches WHERE id LIKE $1', ['leaderboard-test-%']);
    await pool.query('DELETE FROM players WHERE id = ANY($1)', [players]);
  }

  beforeAll(async () => {
    pool = new PgPool(TEST_CONNECTION_STRING);
    matchRepo = new MatchRepository(pool);
    leaderboardRepo = new LeaderboardRepository(pool);
    await cleanup();
    await pool.query('INSERT INTO players (id, username) VALUES ($1, $2), ($3, $4), ($5, $6)', [
      PLAYER_HIGH_WINRATE,
      'LeaderboardTestHigh',
      PLAYER_LOW_GAMES,
      'LeaderboardTestLowGames',
      PLAYER_OPPONENT,
      'LeaderboardTestOpponent',
    ]);

    // PLAYER_HIGH_WINRATE: 3 games, 2 wins, 1 loss -> winRate 2/3
    for (let i = 0; i < 3; i++) {
      const matchId = `leaderboard-test-high-${i}`;
      await matchRepo.recordMatch(new Match(matchId, EndReason.ELIMINATION, Team.A, 60_000, new Date()), [
        new MatchParticipant(matchId, PLAYER_HIGH_WINRATE, Team.A, CHAMPION_HIGH_WINRATE, i < 2 ? MatchResult.WIN : MatchResult.LOSS),
        new MatchParticipant(matchId, PLAYER_OPPONENT, Team.B, CHAMPION_OPPONENT, i < 2 ? MatchResult.LOSS : MatchResult.WIN),
      ]);
    }

    // PLAYER_LOW_GAMES: 1 game, 1 win -> winRate 1/1, but below the minGames=2 threshold used in tests
    const lowGamesMatchId = 'leaderboard-test-lowgames-0';
    await matchRepo.recordMatch(new Match(lowGamesMatchId, EndReason.ELIMINATION, Team.A, 60_000, new Date()), [
      new MatchParticipant(lowGamesMatchId, PLAYER_LOW_GAMES, Team.A, CHAMPION_LOW_GAMES, MatchResult.WIN),
      new MatchParticipant(lowGamesMatchId, PLAYER_OPPONENT, Team.B, CHAMPION_OPPONENT, MatchResult.LOSS),
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await pool.close();
  });

  describe('computeLeaderboard', () => {
    it('computes wins/losses/gamesPlayed/winRate per player, ordered by win rate descending', async () => {
      const entries = await leaderboardRepo.computeLeaderboard(1);
      const high = entries.find((e) => e.playerId === PLAYER_HIGH_WINRATE)!;
      expect(high.wins).toBe(2);
      expect(high.losses).toBe(1);
      expect(high.draws).toBe(0);
      expect(high.gamesPlayed).toBe(3);
      expect(high.winRate).toBeCloseTo(2 / 3, 5);
    });

    it('R8.2: excludes players below minGames', async () => {
      const withLowThreshold = await leaderboardRepo.computeLeaderboard(1);
      expect(withLowThreshold.some((e) => e.playerId === PLAYER_LOW_GAMES)).toBe(true);

      const withHigherThreshold = await leaderboardRepo.computeLeaderboard(2);
      expect(withHigherThreshold.some((e) => e.playerId === PLAYER_LOW_GAMES)).toBe(false);
      expect(withHigherThreshold.some((e) => e.playerId === PLAYER_HIGH_WINRATE)).toBe(true);
    });
  });

  describe('computeChampionWinRates', () => {
    it('aggregates win rate per champion across all recorded matches', async () => {
      const rates = await leaderboardRepo.computeChampionWinRates();
      const high = rates.find((r) => r.championId === CHAMPION_HIGH_WINRATE)!;
      expect(high.gamesPlayed).toBe(3);
      expect(high.winRate).toBeCloseTo(2 / 3, 5);

      const low = rates.find((r) => r.championId === CHAMPION_LOW_GAMES)!;
      expect(low.gamesPlayed).toBe(1);
      expect(low.winRate).toBe(1);
    });
  });
});
