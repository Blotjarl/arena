import { ArenaError } from './ArenaError';

export class UnidentifiedConnectionError extends ArenaError {
  readonly code = 'UNIDENTIFIED_CONNECTION';
  constructor() {
    super('This connection has not sent a valid identify message yet.');
  }
}
