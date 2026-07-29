import { useEffect, useReducer } from 'react';
import { View, ModelListener, ModelEvent, EndReason } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { LobbyController } from '../controller/LobbyController';

/** Human-readable label for each EndReason (R5.1–R5.3). */
const END_REASON_LABELS: Record<EndReason, string> = {
  [EndReason.ELIMINATION]: 'Elimination',
  [EndReason.TIME_LIMIT]: 'Time limit reached',
  [EndReason.DISCONNECT_FORFEIT]: 'Opponent disconnected',
  [EndReason.SELECTION_TIMEOUT]: 'Champion selection timed out',
};

/**
 * MVC View for the post-match Results screen. Observes ClientMatchModel for the final result
 * payload and re-renders when it arrives (SRS 3.1.1, R5.1–R5.3).
 * Pairs with LobbyController because "Return to queue" is a lobby action — no dedicated results
 * controller is specified in docs/01_class_list.md §6c.
 */
export class ResultsView implements View, ModelListener {
  /** Callback registered by ResultsScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * CORRECTION (Step 10): same pattern as the other views in this batch — knowing whether the local
   * player won or lost needs this connection's own team assignment, which arrived on the earlier
   * `match:found` event and lives on ClientQueueModel.matchPayload.team, not on ClientMatchModel.
   * getModel()/setModel() still resolve to ClientMatchModel; queueModel is reachable via a separate
   * getQueueModel() accessor, outside the formal View<M,C> contract.
   * @param model - the match model this view observes for the final result
   * @param queueModel - supplies this connection's own team, to classify the result as win/loss/draw
   * @param controller - the lobby controller used to dispatch "return to queue" actions
   */
  constructor(
    private model: ClientMatchModel,
    private queueModel: ClientQueueModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * @param callback - called with no arguments whenever the model changes
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
   * Returns the lobby controller used to dispatch return-to-queue actions.
   * @returns the current LobbyController
   */
  getController(): LobbyController {
    return this.controller;
  }

  /**
   * Replaces the controller used to dispatch return-to-queue actions.
   * @param controller - the new LobbyController
   */
  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when the match model fires a change event (typically when
   * applyMatchEnd sets the result). Invokes the registered onUpdate callback to re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    this.onUpdate?.();
  }
}

/**
 * Outcome, reason, duration, return-to-queue control (SRS 3.1.1).
 *
 * CRITICAL (master context §1.1): "Victory"/"Defeat"/"Draw" is computed by comparing the server's
 * own `winningTeam` (from `MatchEndPayload`) against this connection's own team (from the earlier
 * `match:found` payload) — both server-supplied facts. This screen never decides who won; it only
 * labels a decision the server already made.
 */
export function ResultsScreen(props: { view: ResultsView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  const match = view.getModel();
  const queue = view.getQueueModel();
  const controller = view.getController();

  const result = match.result;
  if (!result) {
    return <p>Waiting for match result...</p>;
  }

  const myTeam = queue.matchPayload?.team ?? null;
  const outcome = result.winningTeam === null ? 'Draw' : result.winningTeam === myTeam ? 'Victory' : 'Defeat';
  const outcomeClass =
    outcome === 'Victory' ? 'results-outcome--victory' : outcome === 'Defeat' ? 'results-outcome--defeat' : 'results-outcome--draw';

  return (
    <div className="screen screen-results">
      <div className="card results-card">
        <h2 className={`results-outcome ${outcomeClass}`}>{outcome}</h2>
        <p className="results-reason">Reason: {END_REASON_LABELS[result.reason]}</p>
        <p className="results-duration">Duration: {(result.durationMs / 1000).toFixed(1)}s</p>
        <button onClick={() => controller.operation('returnToQueue')} className="btn btn-primary btn-large btn-return">
          Return to Queue
        </button>
      </div>
    </div>
  );
}
