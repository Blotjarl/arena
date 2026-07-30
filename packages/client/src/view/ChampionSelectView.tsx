import { useEffect, useReducer, useState } from 'react';
import { View, ModelListener, ModelEvent } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { ChampionSelectController } from '../controller/ChampionSelectController';

/** Selection window length in seconds — mirrors R3.4; a local UX countdown only, not authoritative. */
const SELECTION_WINDOW_SECONDS = 30;

/**
 * MVC View for the Champion Select screen. Observes ClientMatchModel for selection and phase
 * changes and notifies ChampionSelectScreen to re-render (SRS 3.1.1, R3.1–R3.5).
 */
export class ChampionSelectView implements View, ModelListener {
  /** Callback registered by ChampionSelectScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * CORRECTION (Step 10): the same gap LobbyView (10_client_5) closed applies here — "Both players,
   * selection countdown, roster with stats/abilities" (docs/01_class_list.md §6c) needs more than just
   * ClientMatchModel: the roster and opponent username arrived earlier via `match:found` and live on
   * ClientQueueModel.matchPayload, and telling "my selection" apart from "the opponent's" needs this
   * connection's own playerId from ClientIdentityModel. getModel()/setModel() still resolve to
   * ClientMatchModel, matching ChampionSelectController's `AbstractController<ClientMatchModel,
   * ChampionSelectView>` pairing; the other two models are reachable via extra accessors, same pattern
   * as LobbyView's getQueueModel().
   * @param identityModel - supplies this connection's own playerId, to distinguish "you" from the opponent
   * @param model - the match model this view observes for champion-select phase state
   * @param queueModel - supplies the roster and opponent username carried on the earlier match:found event
   * @param controller - the controller this view dispatches selection actions through
   */
  constructor(
    private identityModel: ClientIdentityModel,
    private model: ClientMatchModel,
    private queueModel: ClientQueueModel,
    private controller: ChampionSelectController,
  ) {
    this.identityModel.addModelListener(this);
    this.model.addModelListener(this);
    this.queueModel.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * @param callback - called with no arguments whenever any observed model changes
   */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Returns the observed match model.
   * @returns the current ClientMatchModel
   */
  getModel(): ClientMatchModel {
    return this.model;
  }

  /**
   * Replaces the observed model reference. Unlike the constructor, this does not re-register the
   * view as a listener on the new model — call `model.addModelListener(this)` separately if needed.
   * @param model - the new ClientMatchModel to observe
   */
  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  /**
   * Returns the observed identity model (CORRECTION, Step 10 — see constructor doc above).
   * @returns the current ClientIdentityModel
   */
  getIdentityModel(): ClientIdentityModel {
    return this.identityModel;
  }

  /**
   * Replaces the observed identity model reference. Does not re-register as a listener.
   * @param identityModel - the new ClientIdentityModel to observe
   */
  setIdentityModel(identityModel: ClientIdentityModel): void {
    this.identityModel = identityModel;
  }

  /**
   * Returns the observed queue model (CORRECTION, Step 10 — see constructor doc above).
   * @returns the current ClientQueueModel
   */
  getQueueModel(): ClientQueueModel {
    return this.queueModel;
  }

  /**
   * Replaces the observed queue model reference. Does not re-register as a listener.
   * @param queueModel - the new ClientQueueModel to observe
   */
  setQueueModel(queueModel: ClientQueueModel): void {
    this.queueModel = queueModel;
  }

  /**
   * Returns the controller used to dispatch selection actions.
   * @returns the current ChampionSelectController
   */
  getController(): ChampionSelectController {
    return this.controller;
  }

  /**
   * Replaces the controller used to dispatch selection actions.
   * @param controller - the new ChampionSelectController
   */
  setController(controller: ChampionSelectController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when any observed model fires a change event.
   * Invokes the registered onUpdate callback to trigger a React re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    this.onUpdate?.();
  }
}

/**
 * Both players, selection countdown, roster with stats/abilities (SRS 3.1.1).
 *
 * CRITICAL (master context §1.1): the roster, opponent identity, and every champion's stats/abilities
 * shown here are exactly what the server sent on `match:found` — this component never invents or
 * computes them. The on-screen countdown is a purely local, approximate UX timer (R3.4 is enforced
 * server-side by MatchModel.selectChampion's 30-second deadline check, which this screen has no access
 * to and does not attempt to replicate); reaching 0 here changes nothing by itself — only a rejected
 * `champion:select` (surfaced as a wire `error` event) or the server's own phase transition does.
 */
export function ChampionSelectScreen(props: { view: ChampionSelectView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const [secondsLeft, setSecondsLeft] = useState(SELECTION_WINDOW_SECONDS);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const identity = view.getIdentityModel();
  const match = view.getModel();
  const queue = view.getQueueModel();
  const controller = view.getController();

  const roster = queue.matchPayload?.roster ?? [];
  const opponentUsername = queue.matchPayload?.opponentUsername ?? 'Opponent';
  const mySelection =
    match.championSelection && match.championSelection.playerId === identity.playerId
      ? match.championSelection
      : null;
  const bothSelected = match.championSelection?.bothSelected ?? false;

  const maxRosterHealth = roster.reduce((max, c) => Math.max(max, c.maxHealth), 1);

  return (
    <div className="screen screen-champion-select">
      <header className="select-header">
        <p className={`countdown ${secondsLeft <= 10 ? 'countdown--urgent' : ''}`}>
          Selection window: {secondsLeft}s
        </p>
        <div className="players-row">
          <p>You: {identity.username}</p>
          <p>Opponent: {opponentUsername}</p>
        </div>
        {mySelection && <p className="my-selection">You selected: {mySelection.championId}</p>}
        {bothSelected && <p className="both-ready">Both players ready</p>}
      </header>
      <ul aria-label="champion-roster" className="champion-roster">
        {roster.map((champion) => {
          const isMine = mySelection?.championId === champion.id;
          return (
            <li key={champion.id} className={`champion-card champion-${champion.id} ${isMine ? 'champion-card--selected' : ''}`}>
              <span className="champion-name-row">
                {champion.name} — {champion.role}
              </span>
              <span className="stat-readout" aria-hidden="true">
                {champion.maxHealth} HP
              </span>
              <div className="bar bar--stat" aria-hidden="true">
                <div
                  className="bar-fill"
                  style={{ width: `${(champion.maxHealth / maxRosterHealth) * 100}%` }}
                />
              </div>
              <ul className="ability-list">
                {champion.abilities.map((ability) => (
                  <li key={ability.id} className="ability-chip" title={ability.description}>
                    <span className="ability-name">{ability.name}</span>
                    <span className="ability-meta" aria-hidden="true">
                      {ability.cooldownSeconds}s CD
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => controller.operation('selectChampion', { championId: champion.id })}
                disabled={mySelection !== null}
                className="btn btn-select"
              >
                Select {champion.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
