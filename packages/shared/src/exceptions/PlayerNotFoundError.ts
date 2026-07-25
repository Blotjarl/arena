import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

/** Thrown when a `PlayerRepository` lookup finds no row for the given id. */
export class PlayerNotFoundError extends ArenaError {
  readonly code = 'PLAYER_NOT_FOUND';

  /** @param playerId - the id that failed to resolve */
  constructor(playerId: PlayerId) {
    super(`No player found with id ${playerId}.`);
  }
}
