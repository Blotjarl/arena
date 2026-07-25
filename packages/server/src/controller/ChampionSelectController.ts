import { AbstractController, NotImplementedError } from '@arena/shared';

/** Handles a player's champion choice during the CHAMPION_SELECT phase (R3.1–R3.5). */
export class ChampionSelectController extends AbstractController {
  /**
   * Dispatches a `champion:select` request to the underlying MatchModel.
   * @param action - the champion-select action, e.g. 'champion:select'
   * @param payload - the selecting player and chosen championId
   * @throws {InvalidMatchPhaseError} if the match is not currently in CHAMPION_SELECT — not caught here;
   * a phase violation implies a misbehaving client rather than a normal player-facing validation failure
   *
   * InvalidChampionSelectionError and SelectionWindowExpiredError (R3.2, R3.4) from
   * MatchModel.selectChampion() are caught here and forwarded to the view as an `error` payload rather
   * than left to propagate — mirrors the course's controller-catches/view-shows-popup pattern.
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('ChampionSelectController.operation not yet implemented');
  }
}
