import { PersistenceError } from '@arena/shared';
import { PgPool } from './PgPool';

// Requires `npm run test:db:up` first -- packages/api/schema.sql is applied automatically via Postgres's
// init-scripts mechanism when the container first starts.
const TEST_CONNECTION_STRING = 'postgresql://arena:arena@localhost:55432/arena_test';

describe('PgPool (integration — real PostgreSQL)', () => {
  let pool: PgPool;

  beforeAll(() => {
    pool = new PgPool(TEST_CONNECTION_STRING);
  });

  afterAll(async () => {
    await pool.close();
  });

  it('runs a parameterized query against the real schema and returns rows', async () => {
    await pool.query('DELETE FROM players WHERE id = $1', ['test-player-1']);
    await pool.query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-player-1', 'IntegrationTester']);
    const rows = await pool.query<{ id: string; username: string }>(
      'SELECT id, username FROM players WHERE id = $1',
      ['test-player-1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe('IntegrationTester');
    await pool.query('DELETE FROM players WHERE id = $1', ['test-player-1']);
  });

  it('throws PersistenceError, not a raw pg error, on a constraint violation', async () => {
    await pool.query('DELETE FROM players WHERE id = $1', ['test-player-2']);
    await pool.query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-player-2', 'DupeCheck']);
    await expect(
      pool.query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-player-2-dup', 'DupeCheck']),
    ).rejects.toThrow(PersistenceError); // username UNIQUE constraint
    await pool.query('DELETE FROM players WHERE id = $1', ['test-player-2']);
  });

  it('throws PersistenceError on malformed SQL rather than letting the driver error escape', async () => {
    await expect(pool.query('SELECT * FROM this_table_does_not_exist', [])).rejects.toThrow(PersistenceError);
  });

  it('enforces the schema CHECK constraint on matches.end_reason', async () => {
    await expect(
      pool.query(
        "INSERT INTO matches (id, end_reason, duration_ms, ended_at) VALUES ($1, 'NOT_A_REAL_REASON', 1000, now())",
        ['test-match-1'],
      ),
    ).rejects.toThrow(PersistenceError);
  });

  describe('transaction', () => {
    afterEach(async () => {
      await pool.query('DELETE FROM players WHERE id = $1', ['test-txn-player']);
    });

    it('commits all queries together when fn succeeds', async () => {
      const result = await pool.transaction(async (query) => {
        await query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-txn-player', 'TxnCommitTest']);
        return query<{ username: string }>('SELECT username FROM players WHERE id = $1', ['test-txn-player']);
      });
      expect(result).toEqual([{ username: 'TxnCommitTest' }]);

      const rows = await pool.query('SELECT id FROM players WHERE id = $1', ['test-txn-player']);
      expect(rows).toHaveLength(1);
    });

    it('rolls back every query in the transaction when fn throws partway through', async () => {
      await expect(
        pool.transaction(async (query) => {
          await query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-txn-player', 'TxnRollbackTest']);
          throw new Error('simulated failure after the insert');
        }),
      ).rejects.toThrow(PersistenceError);

      const rows = await pool.query('SELECT id FROM players WHERE id = $1', ['test-txn-player']);
      expect(rows).toHaveLength(0); // the insert above must not have survived the rollback
    });

    it('rolls back when a query inside the transaction violates a constraint', async () => {
      await expect(
        pool.transaction(async (query) => {
          await query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-txn-player', 'TxnConstraintTest']);
          await query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-txn-player-dup', 'TxnConstraintTest']); // duplicate username
        }),
      ).rejects.toThrow(PersistenceError);

      const rows = await pool.query('SELECT id FROM players WHERE id = $1', ['test-txn-player']);
      expect(rows).toHaveLength(0);
    });
  });
});
