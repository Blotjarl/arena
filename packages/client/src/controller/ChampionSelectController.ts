import { AbstractController, SOCKET_EVENTS, ChampionId } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { ChampionSelectView } from '../view/ChampionSelectView';
import { SocketConnectionController } from './SocketConnectionController';

/**
 * Handles the player's champion selection during the CHAMPION_SELECT phase (R3.1–R3.5).
 * Forwards the chosen champion to the server; the server validates availability and timing.
 */
export class ChampionSelectController extends AbstractController<ClientMatchModel, ChampionSelectView> {
  /**
   * CORRECTION (Step 10): as with LobbyController (10_client_2), this controller needs a
   * SocketConnectionController reference to actually emit anything — docs/01_class_list.md §6b's
   * constructor sketch only documents the inherited (model, view) shape.
   * @param model - the match model this controller reads from (not mutated here — the server, via
   *   `champion:selected`, is the only thing that ever updates it)
   * @param view - the paired ChampionSelectView
   * @param socketController - used to emit `champion:select` to the server
   */
  constructor(
    model: ClientMatchModel,
    view: ChampionSelectView,
    private readonly socketController: SocketConnectionController,
  ) {
    super(model, view);
  }

  /**
   * Dispatches a champion-select action (e.g. 'selectChampion').
   * The server enforces the 30-second selection window (R3.4) and champion uniqueness (R3.2);
   * this controller does not enforce those constraints — it forwards the request unconditionally and
   * lets the resulting `champion:selected` broadcast or `error` event (relayed onto ClientMatchModel /
   * surfaced by the view) reflect the outcome.
   * @param action - the champion-select action to dispatch
   * @param payload - for 'selectChampion', the chosen champion's identifier
   */
  operation(action: string, payload?: { championId: ChampionId }): void {
    if (action !== 'selectChampion' || !payload) return;
    this.socketController.operation(SOCKET_EVENTS.CHAMPION_SELECT, { championId: payload.championId });
  }
}
