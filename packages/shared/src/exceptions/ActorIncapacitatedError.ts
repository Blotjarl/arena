import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

/**
 * Thrown when a player attempts to move or use an ability while dead or crowd-controlled (R4.2, R6.1).
 */
export class ActorIncapacitatedError extends ArenaError {
  readonly code = 'ACTOR_INCAPACITATED';

  /**
   * @param playerId - the player who attempted to act
   * @param reason - why the player is currently unable to act
   */
  constructor(playerId: PlayerId, reason: 'dead' | 'crowd-controlled') {
    super(`Player ${playerId} cannot act — ${reason}.`);
  }
}
