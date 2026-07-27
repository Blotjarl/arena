import { Pool } from 'pg';
import { PersistenceError } from '@arena/shared';

/** Thin wrapper over the PostgreSQL connection pool (R-D3) — the only class in `packages/api` that talks to
 *  `pg` directly; every `*Repository` depends on it rather than importing `pg` itself. */
export class PgPool {
  private readonly pool: Pool;

  /** @param connectionString - the PostgreSQL connection string to pool connections against */
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /**
   * Runs a parameterized SQL query against the pool.
   * @param sql - the SQL text, with $1/$2/... placeholders
   * @param params - values bound to the query's placeholders
   * @returns the query's result rows
   * @throws {PersistenceError} if the underlying query fails (connection drop, constraint violation,
   *   timeout, or any other driver-level failure)
   */
  async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    try {
      const result = await this.pool.query(sql, params);
      return result.rows as T[];
    } catch (err) {
      throw new PersistenceError('query', err);
    }
  }

  /**
   * Runs a series of queries as a single atomic transaction on one pooled connection: `BEGIN`, then `fn`
   * with a `query` function scoped to that connection, then `COMMIT` on success or `ROLLBACK` on failure.
   * Needed by `MatchRepository.recordMatch` (one `matches` row plus two `match_participants` rows must
   * commit or fail together, R-DB4) — `PgPool.query` alone can't guarantee that, since the pool may hand
   * out a different connection per call.
   * @param fn - receives a `query` function bound to the transaction's connection; its return value is
   *   this method's return value once the transaction commits
   * @returns whatever `fn` returns
   * @throws {PersistenceError} if `fn` throws, or if `BEGIN`/`COMMIT`/the query itself fails — the
   *   transaction is rolled back first in either case
   */
  async transaction<T>(fn: (query: <R>(sql: string, params: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const scopedQuery = async <R>(sql: string, params: unknown[]): Promise<R[]> => {
        const result = await client.query(sql, params);
        return result.rows as R[];
      };
      const result = await fn(scopedQuery);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new PersistenceError('transaction', err);
    } finally {
      client.release();
    }
  }

  /** Closes all pooled connections — call once on process shutdown, and in test teardown. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
