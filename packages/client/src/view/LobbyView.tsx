import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { LobbyController } from '../controller/LobbyController';

/**
 * MVC View for the Lobby screen. Listens for ClientIdentityModel changes and notifies the paired
 * React functional component (LobbyScreen) to re-render (SRS 3.1.1, R1.1–R1.4, R2.1–R2.6).
 */
export class LobbyView implements View, ModelListener {
  /** Callback registered by LobbyScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * @param model - the identity model this view observes
   * @param controller - the lobby controller this view dispatches user actions through
   */
  constructor(
    private model: ClientIdentityModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * The paired functional component supplies this so modelChanged can trigger a re-render.
   * @param callback - called with no arguments whenever the model changes
   */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Returns the observed identity model.
   * @returns the current ClientIdentityModel
   */
  getModel(): ClientIdentityModel {
    return this.model;
  }

  /**
   * Replaces the observed model and re-registers this view as a listener.
   * @param model - the new ClientIdentityModel to observe
   */
  setModel(model: ClientIdentityModel): void {
    this.model = model;
  }

  /**
   * Returns the lobby controller used to dispatch user actions.
   * @returns the current LobbyController
   */
  getController(): LobbyController {
    return this.controller;
  }

  /**
   * Replaces the controller used to dispatch user actions.
   * @param controller - the new LobbyController
   */
  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when the identity model fires a change event.
   * Invokes the registered onUpdate callback to trigger a React re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('LobbyView.modelChanged not yet implemented');
  }
}

/** Username field, "Find Match" control, queue status/cancel (SRS 3.1.1). */
export function LobbyScreen(props: { view: LobbyView }): JSX.Element {
  throw new NotImplementedError('LobbyScreen render not yet implemented');
}
