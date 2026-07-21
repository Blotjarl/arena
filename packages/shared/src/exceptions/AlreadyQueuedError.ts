import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

export class AlreadyQueuedError extends ArenaError {
  readonly code = 'ALREADY_QUEUED';
  constructor(playerId: PlayerId) {
    super(`Player ${playerId} is already queued or in an active match.`);
  }
}
