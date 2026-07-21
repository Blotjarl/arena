import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

export class ActorIncapacitatedError extends ArenaError {
  readonly code = 'ACTOR_INCAPACITATED';
  constructor(playerId: PlayerId, reason: 'dead' | 'crowd-controlled') {
    super(`Player ${playerId} cannot act — ${reason}.`);
  }
}
