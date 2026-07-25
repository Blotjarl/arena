import { ArenaError } from './ArenaError';

/** Thrown by REST controllers when an incoming request body fails validation (3.6.2). */
export class ValidationError extends ArenaError {
  readonly code = 'VALIDATION_ERROR';

  /**
   * @param field - the request field that failed validation
   * @param reason - why the field's value was rejected
   */
  constructor(field: string, reason: string) {
    super(`Invalid ${field}: ${reason}`);
  }
}
