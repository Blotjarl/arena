import { PersistenceError, NotImplementedError } from '@arena/shared';

export class PgPool {
  constructor(private readonly connectionString: string) {}

  /** @throws PersistenceError */
  async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    throw new NotImplementedError('PgPool.query not yet implemented');
  }
}
