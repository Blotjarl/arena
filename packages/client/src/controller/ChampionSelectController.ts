import { AbstractController, NotImplementedError } from '@arena/shared';

/**
 * Handles the player's champion selection during the CHAMPION_SELECT phase (R3.1–R3.5).
 * Forwards the chosen champion to the server; the server validates availability and timing.
 */
export class ChampionSelectController extends AbstractController {
  /**
   * Dispatches a champion-select action (e.g. 'selectChampion').
   * The server enforces the 30-second selection window (R3.4) and champion uniqueness (R3.2);
   * this controller does not enforce those constraints.
   * @param action - the champion-select action to dispatch
   * @param payload - for 'selectChampion', the chosen champion's identifier
   */
  operation(action: string, payload?: { championId: string }): void {
    throw new NotImplementedError('ChampionSelectController.operation not yet implemented');
  }
}
