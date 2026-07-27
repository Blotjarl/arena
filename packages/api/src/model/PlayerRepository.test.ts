import { PgPool } from '../util/PgPool';
import { PlayerRepository } from './PlayerRepository';

// Requires `npm run test:db:up` first -- packages/api/schema.sql is applied automatically via Postgres's
// init-scripts mechanism when the container first starts.
const TEST_CONNECTION_STRING = 'postgresql://arena:arena@localhost:55432/arena_test';

describe('PlayerRepository (integration — real PostgreSQL)', () => {
  let pool: PgPool;
  let repo: PlayerRepository;

  beforeAll(() => {
    pool = new PgPool(TEST_CONNECTION_STRING);
    repo = new PlayerRepository(pool);
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM players WHERE username LIKE $1', ['PlayerRepoTest%']);
  });

  it('creates a new Player row when the username has not been seen before', async () => {
    const player = await repo.findOrCreateByUsername('PlayerRepoTestNew');
    expect(player.username).toBe('PlayerRepoTestNew');
    expect(typeof player.id).toBe('string');
    expect(player.id.length).toBeGreaterThan(0);
    expect(player.createdAt).toBeInstanceOf(Date);

    const rows = await pool.query<{ id: string }>('SELECT id FROM players WHERE username = $1', ['PlayerRepoTestNew']);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(player.id);
  });

  it('returns the existing Player row (same id) on a repeat lookup, without creating a duplicate', async () => {
    const first = await repo.findOrCreateByUsername('PlayerRepoTestExisting');
    const second = await repo.findOrCreateByUsername('PlayerRepoTestExisting');

    expect(second.id).toBe(first.id);
    expect(second.username).toBe('PlayerRepoTestExisting');

    const rows = await pool.query('SELECT id FROM players WHERE username = $1', ['PlayerRepoTestExisting']);
    expect(rows).toHaveLength(1);
  });

  it('resolves by username, not by a caller-supplied transient id — the canonical id is server-generated', async () => {
    const player = await repo.findOrCreateByUsername('PlayerRepoTestCanonical');
    // A second call with the same username must return the same canonical id regardless of any
    // session-scoped PlayerId a live match might have used (SRS R1.2 / 09_api_2's design note).
    const again = await repo.findOrCreateByUsername('PlayerRepoTestCanonical');
    expect(again.id).toBe(player.id);
  });
});
