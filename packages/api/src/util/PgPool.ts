import { PersistenceError, NotImplementedError } from '@arena/shared';

/** Thin wrapper over the PostgreSQL connection pool (R-D3) — the only class in `packages/api` that talks
 *  to `pg` directly; every `*Repository` depends on it rather than importing `pg` itself. */
export class PgPool {
  /** @param connectionString - the PostgreSQL connection string to pool connections against */
  constructor(private readonly connectionString: string) {}

  /**
   * Runs a parameterized SQL query against the pool.
   * @param sql - the SQL text, with `$1`/`$2`/... placeholders
   * @param params - values bound to the query's placeholders
   * @returns the query's result rows
   * @throws {PersistenceError} if the underlying query fails (connection drop, constraint violation,
   *   timeout, or any other driver-level failure)
   */
  async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    throw new NotImplementedError('PgPool.query not yet implemented');
  }
}
