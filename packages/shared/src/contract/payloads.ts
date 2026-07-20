import { PlayerId } from '../domain/ids';
import { Position } from '../domain/Position';

export interface IdentifyPayload {
  playerId: PlayerId;
  username: string;
}

export interface MovementInput {
  dx: number;
  dy: number;
}

export interface AbilityUseRequest {
  abilityId: string;
  targetPlayerId?: PlayerId;
  targetPosition?: Position;
}
