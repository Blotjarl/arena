import { ArenaError } from './ArenaError';

/** Thrown when any `*Repository` method fails to read from or write to PostgreSQL (R7.4, R-DB4). */
export class PersistenceError extends ArenaError {
  readonly code = 'PERSISTENCE_ERROR';

  /**
   * @param operation - a short label for the repository operation that failed (e.g. `'recordMatch'`)
   * @param cause - the underlying error, if any, included in the message for diagnosis
   */
  constructor(operation: string, cause?: unknown) {
    super(`Persistence operation "${operation}" failed${cause ? `: ${String(cause)}` : '.'}`);
  }
}
