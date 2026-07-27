import {
  AbstractController,
  ModelEvent,
  InvalidChampionSelectionError,
  SelectionWindowExpiredError,
} from '@arena/shared';
import { MatchModel } from '../model/MatchModel';
import { MatchBroadcastView } from '../view/MatchBroadcastView';

/** Payload ConnectionHandler forwards for a `champion:select` request — the raw wire payload plus the connection's identified playerId (the wire event itself carries no playerId, see 10_server_6). */
export interface ChampionSelectRequest {
  playerId: string;
  championId: string;
}

/** Handles a player's champion choice during the CHAMPION_SELECT phase (R3.1–R3.5). */
export class ChampionSelectController extends AbstractController {
  constructor(model: MatchModel, view: MatchBroadcastView) {
    super(model, view);
  }

  /**
   * Dispatches a `champion:select` request to the underlying MatchModel.
   * @param action - the champion-select action, e.g. 'champion:select'
   * @param payload - the selecting player and chosen championId
   * @throws {InvalidMatchPhaseError} if the match is not currently in CHAMPION_SELECT — not caught here;
   * a phase violation implies a misbehaving client rather than a normal player-facing validation failure
   *
   * InvalidChampionSelectionError and SelectionWindowExpiredError (R3.2, R3.4) from
   * MatchModel.selectChampion() are caught here and forwarded to the view as a per-player `error` event
   * rather than left to propagate — mirrors the course's controller-catches/view-shows-popup pattern.
   */
  operation(action: string, payload?: ChampionSelectRequest): void {
    const match = this.model as MatchModel;
    const view = this.view as MatchBroadcastView;
    try {
      match.selectChampion(payload!.playerId, payload!.championId);
    } catch (err) {
      if (err instanceof InvalidChampionSelectionError || err instanceof SelectionWindowExpiredError) {
        view.modelChanged(
          new ModelEvent(match, 'error', { playerId: payload!.playerId, code: err.code, message: err.message }),
        );
        return;
      }
      throw err;
    }
  }
}
