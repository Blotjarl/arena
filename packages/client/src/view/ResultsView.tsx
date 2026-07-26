import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { LobbyController } from '../controller/LobbyController';

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
   * @param model - the match model this view observes for the final result
   * @param controller - the lobby controller used to dispatch "return to queue" actions
   */
  constructor(
    private model: ClientMatchModel,
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
    throw new NotImplementedError('ResultsView.modelChanged not yet implemented');
  }
}

/** Outcome, reason, duration, return-to-queue control (SRS 3.1.1). */
export function ResultsScreen(props: { view: ResultsView }): JSX.Element {
  throw new NotImplementedError('ResultsScreen render not yet implemented');
}
