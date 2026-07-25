import { ArenaError } from './ArenaError';

/** Thrown when a socket sends any message other than `identify` before completing identification (R1.4). */
export class UnidentifiedConnectionError extends ArenaError {
  readonly code = 'UNIDENTIFIED_CONNECTION';

  constructor() {
    super('This connection has not sent a valid identify message yet.');
  }
}
