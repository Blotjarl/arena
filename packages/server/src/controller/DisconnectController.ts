import { AbstractController, NotImplementedError } from '@arena/shared';

/**
 * Handles socket disconnect and match:reconnect events, owning the 30-second reconnect grace-period
 * timer (R6.1–R6.4). Unlike CombatController/ChampionSelectController, a reconnect failure is genuinely
 * exceptional (the player missed their window) and is surfaced to the caller rather than swallowed.
 */
export class DisconnectController extends AbstractController {
  /**
   * Dispatches a `disconnect` or `match:reconnect` event. On 'disconnect', starts the grace-period timer
   * via MatchModel.disconnect() and schedules the forfeit that fires if it's not cancelled by a reconnect.
   * On 'match:reconnect', cancels that timer and restores the participant via MatchModel.reconnect().
   * @param action - 'disconnect' or 'match:reconnect'
   * @param payload - the reconnecting/disconnecting player's identity
   * @throws {GracePeriodExpiredError} if 'match:reconnect' arrives after the 30-second grace period (R6.3, R6.4)
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('DisconnectController.operation not yet implemented');
  }
}
