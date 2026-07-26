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

  /** Closes all pooled connections — call once on process shutdown, and in test teardown. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
