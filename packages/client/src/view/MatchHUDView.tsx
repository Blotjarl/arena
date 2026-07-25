import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { MatchController } from '../controller/MatchController';
import { InterpolationBuffer } from '../model/InterpolationBuffer';

/**
 * MVC View for the in-combat HUD screen. Observes ClientMatchModel for authoritative tick
 * snapshots and uses InterpolationBuffer for smooth between-tick rendering (R4.7, R-P4).
 * Player input is forwarded to MatchController (SRS 3.1.1, R4.1–R4.7).
 */
export class MatchHUDView implements View, ModelListener {
  /** Callback registered by MatchHUDScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * Rendering-only interpolation buffer; capacity of 10 retains ~500ms of ticks at 20Hz.
   * Positions produced here are never written back to ClientMatchModel.
   */
  private readonly interpolation = new InterpolationBuffer(10);

  /**
   * @param model - the match model this view observes for authoritative combat state
   * @param controller - the controller this view forwards player input through
   */
  constructor(
    private model: ClientMatchModel,
    private controller: MatchController,
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
   * Replaces the observed model and re-registers this view as a listener.
   * @param model - the new ClientMatchModel to observe
   */
  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  /**
   * Returns the controller used to forward player input.
   * @returns the current MatchController
   */
  getController(): MatchController {
    return this.controller;
  }

  /**
   * Replaces the controller used to forward player input.
   * @param controller - the new MatchController
   */
  setController(controller: MatchController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when the match model fires a change event (i.e. a new tick snapshot
   * has arrived). Feeds the snapshot into the interpolation buffer, then invokes onUpdate.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchHUDView.modelChanged not yet implemented');
  }
}

/** Health/resource bars, cooldown indicators, arena rendering via InterpolationBuffer (SRS 3.1.1). */
export function MatchHUDScreen(props: { view: MatchHUDView }): JSX.Element {
  throw new NotImplementedError('MatchHUDScreen render not yet implemented');
}
