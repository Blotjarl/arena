import { ArenaError } from './ArenaError';

export class PersistenceError extends ArenaError {
  readonly code = 'PERSISTENCE_ERROR';
  constructor(operation: string, cause?: unknown) {
    super(`Persistence operation "${operation}" failed${cause ? `: ${String(cause)}` : '.'}`);
  }
}
