import { ArenaError } from './ArenaError';

export class ValidationError extends ArenaError {
  readonly code = 'VALIDATION_ERROR';
  constructor(field: string, reason: string) {
    super(`Invalid ${field}: ${reason}`);
  }
}
