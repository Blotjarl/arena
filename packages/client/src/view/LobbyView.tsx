import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { LobbyController } from '../controller/LobbyController';

export class LobbyView implements View, ModelListener {
  private onUpdate: (() => void) | null = null;

  constructor(
    private model: ClientIdentityModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
  }

  /** The paired functional component supplies this so modelChanged can trigger a re-render. */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  getModel(): ClientIdentityModel {
    return this.model;
  }

  setModel(model: ClientIdentityModel): void {
    this.model = model;
  }

  getController(): LobbyController {
    return this.controller;
  }

  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('LobbyView.modelChanged not yet implemented');
  }
}

/** Username field, "Find Match" control, queue status/cancel (SRS 3.1.1). */
export function LobbyScreen(props: { view: LobbyView }): JSX.Element {
  throw new NotImplementedError('LobbyScreen render not yet implemented');
}
