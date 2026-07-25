import { PlayerId } from '../domain/ids';
import { Position } from '../domain/Position';

/** Sent client→server on the `identify` event, once per connection, before any other message (R1.1–R1.4). */
export interface IdentifyPayload {
  playerId: PlayerId;
  username: string;
}

/** Sent client→server as part of `match:action` to move a champion (R4.1). */
export interface MovementInput {
  dx: number;
  dy: number;
}

/** Sent client→server as part of `match:action` to use an ability (R4.2). */
export interface AbilityUseRequest {
  abilityId: string;
  /** Present for abilities that target a player rather than a position. */
  targetPlayerId?: PlayerId;
  /** Present for abilities that target a point in arena-space rather than a player. */
  targetPosition?: Position;
}
