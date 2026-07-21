import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

export class PlayerNotFoundError extends ArenaError {
  readonly code = 'PLAYER_NOT_FOUND';
  constructor(playerId: PlayerId) {
    super(`No player found with id ${playerId}.`);
  }
}
