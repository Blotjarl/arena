import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

export class NotQueuedError extends ArenaError {
  readonly code = 'NOT_QUEUED';
  constructor(playerId: PlayerId) {
    super(`Player ${playerId} is not currently queued.`);
  }
}
