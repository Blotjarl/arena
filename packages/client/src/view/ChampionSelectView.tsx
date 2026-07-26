import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { ChampionSelectController } from '../controller/ChampionSelectController';

/**
 * MVC View for the Champion Select screen. Observes ClientMatchModel for selection and phase
 * changes and notifies ChampionSelectScreen to re-render (SRS 3.1.1, R3.1–R3.5).
 */
export class ChampionSelectView implements View, ModelListener {
  /** Callback registered by ChampionSelectScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * @param model - the match model this view observes for champion-select phase state
   * @param controller - the controller this view dispatches selection actions through
   */
  constructor(
    private model: ClientMatchModel,
    private controller: ChampionSelectController,
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
   * Returns the controller used to dispatch champion selection actions.
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
   * Called by AbstractModel when the match model fires a change event.
   * Invokes the registered onUpdate callback to trigger a React re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('ChampionSelectView.modelChanged not yet implemented');
  }
}

/** Both players, selection countdown, roster with stats/abilities (SRS 3.1.1). */
export function ChampionSelectScreen(props: { view: ChampionSelectView }): JSX.Element {
  throw new NotImplementedError('ChampionSelectScreen render not yet implemented');
}
