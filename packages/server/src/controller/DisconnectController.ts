import { AbstractController, SOCKET_EVENTS } from '@arena/shared';
import { MatchModel } from '../model/MatchModel';
import { MatchBroadcastView } from '../view/MatchBroadcastView';

/** Payload ConnectionHandler forwards for a `disconnect` or `match:reconnect` event. */
export interface DisconnectRequest {
  playerId: string;
}

/**
 * Handles socket disconnect and `match:reconnect` events (R6.1–R6.4). Unlike CombatController/
 * ChampionSelectController, a reconnect failure is genuinely exceptional (the player missed their
 * window) and is surfaced to the caller rather than swallowed.
 *
 * CORRECTION (Step 10): this controller does not own a separate grace-period timer, despite the original
 * stub's doc comment suggesting it should — `MatchModel.tick()` (implemented and merged in `09_server_5`)
 * already checks every disconnected participant's elapsed grace period on every tick and ends the match
 * via `DISCONNECT_FORFEIT` once 30s have passed (R6.3, R6.4). A second, independently-scheduled timer
 * here would be redundant and could race the tick-driven one. This controller's only job is forwarding to
 * `MatchModel.disconnect`/`reconnect`.
 */
export class DisconnectController extends AbstractController {
  constructor(model: MatchModel, view: MatchBroadcastView) {
    super(model, view);
  }

  /**
   * Dispatches a `disconnect` or `match:reconnect` event to the underlying MatchModel.
   * @param action - 'disconnect' or 'match:reconnect'
   * @param payload - the reconnecting/disconnecting player's identity
   * @throws {GracePeriodExpiredError} if 'match:reconnect' arrives after the 30-second grace period (R6.3, R6.4)
   */
  operation(action: string, payload?: DisconnectRequest): void {
    if (!payload) return;
    const match = this.model as MatchModel;
    if (action === SOCKET_EVENTS.MATCH_RECONNECT) {
      match.reconnect(payload.playerId);
    } else {
      match.disconnect(payload.playerId);
    }
  }
}
