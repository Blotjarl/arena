import { Match, MatchParticipant, Team, EndReason, MatchResult } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { MatchRepository } from './MatchRepository';

// Requires `npm run test:db:up` first -- packages/api/schema.sql is applied automatically via Postgres's
// init-scripts mechanism when the container first starts.
const TEST_CONNECTION_STRING = 'postgresql://arena:arena@localhost:55432/arena_test';

const PLAYER_A = 'match-repo-test-player-a';
const PLAYER_B = 'match-repo-test-player-b';

describe('MatchRepository (integration — real PostgreSQL)', () => {
  let pool: PgPool;
  let repo: MatchRepository;

  beforeAll(async () => {
    pool = new PgPool(TEST_CONNECTION_STRING);
    repo = new MatchRepository(pool);
    await pool.query('INSERT INTO players (id, username) VALUES ($1, $2), ($3, $4)', [
      PLAYER_A,
      'MatchRepoTestPlayerA',
      PLAYER_B,
      'MatchRepoTestPlayerB',
    ]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM match_participants WHERE player_id = ANY($1)', [[PLAYER_A, PLAYER_B]]);
    await pool.query('DELETE FROM matches WHERE id LIKE $1', ['match-repo-test-%']);
    await pool.query('DELETE FROM players WHERE id = ANY($1)', [[PLAYER_A, PLAYER_B]]);
    await pool.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM match_participants WHERE player_id = ANY($1)', [[PLAYER_A, PLAYER_B]]);
    await pool.query('DELETE FROM matches WHERE id LIKE $1', ['match-repo-test-%']);
  });

  function makeMatch(id: string, endedAt: Date): Match {
    return new Match(id, EndReason.ELIMINATION, Team.A, 90_000, endedAt);
  }

  function makeParticipants(matchId: string): MatchParticipant[] {
    return [
      new MatchParticipant(matchId, PLAYER_A, Team.A, 'korr', MatchResult.WIN),
      new MatchParticipant(matchId, PLAYER_B, Team.B, 'vex', MatchResult.LOSS),
    ];
  }

  describe('recordMatch', () => {
    it('writes one matches row and exactly two match_participants rows', async () => {
      const matchId = 'match-repo-test-1';
      await repo.recordMatch(makeMatch(matchId, new Date('2026-01-01T00:00:00Z')), makeParticipants(matchId));

      const matchRows = await pool.query('SELECT id, winning_team, end_reason FROM matches WHERE id = $1', [matchId]);
      expect(matchRows).toHaveLength(1);
      expect(matchRows[0]).toMatchObject({ id: matchId, winning_team: 'A', end_reason: 'ELIMINATION' });

      const participantRows = await pool.query('SELECT player_id, result FROM match_participants WHERE match_id = $1', [
        matchId,
      ]);
      expect(participantRows).toHaveLength(2);
    });

    it('persists a draw (null winningTeam) correctly', async () => {
      const matchId = 'match-repo-test-draw';
      const draw = new Match(matchId, EndReason.TIME_LIMIT, null, 300_000, new Date());
      await repo.recordMatch(draw, makeParticipants(matchId));

      const rows = await pool.query<{ winning_team: string | null }>('SELECT winning_team FROM matches WHERE id = $1', [
        matchId,
      ]);
      expect(rows[0].winning_team).toBeNull();
    });

    it('CRITICAL: rolls back the match row too when a participant insert fails (atomic write, R-DB4)', async () => {
      const matchId = 'match-repo-test-atomic';
      const badParticipants = [
        new MatchParticipant(matchId, PLAYER_A, Team.A, 'korr', MatchResult.WIN),
        new MatchParticipant(matchId, 'no-such-player', Team.B, 'vex', MatchResult.LOSS), // FK violation
      ];

      await expect(repo.recordMatch(makeMatch(matchId, new Date()), badParticipants)).rejects.toThrow();

      const matchRows = await pool.query('SELECT id FROM matches WHERE id = $1', [matchId]);
      expect(matchRows).toHaveLength(0); // the matches insert must not have survived the rollback
    });
  });

  describe('findHistoryForPlayer', () => {
    it('returns matches most-recent-first, paginated', async () => {
      const ids = ['match-repo-test-h1', 'match-repo-test-h2', 'match-repo-test-h3'];
      const dates = [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z'), new Date('2026-01-03T00:00:00Z')];
      for (let i = 0; i < ids.length; i++) {
        await repo.recordMatch(makeMatch(ids[i], dates[i]), makeParticipants(ids[i]));
      }

      const page1 = await repo.findHistoryForPlayer(PLAYER_A, 1, 2);
      expect(page1.map((p) => p.matchId)).toEqual(['match-repo-test-h3', 'match-repo-test-h2']);

      const page2 = await repo.findHistoryForPlayer(PLAYER_A, 2, 2);
      expect(page2.map((p) => p.matchId)).toEqual(['match-repo-test-h1']);
    });

    it('returns an empty array for a player with no match history', async () => {
      const history = await repo.findHistoryForPlayer('nobody-has-played-me', 1, 10);
      expect(history).toEqual([]);
    });
  });
});
