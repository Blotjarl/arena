import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { LobbyController } from '../controller/LobbyController';

/** "Return to queue" is a lobby action — pairs with LobbyController, not a dedicated results controller (docs/01_class_list.md §6c didn't specify one). */
export class ResultsView implements View, ModelListener {
  private onUpdate: (() => void) | null = null;

  constructor(
    private model: ClientMatchModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
  }

  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  getModel(): ClientMatchModel {
    return this.model;
  }

  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  getController(): LobbyController {
    return this.controller;
  }

  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('ResultsView.modelChanged not yet implemented');
  }
}

/** Outcome, reason, duration, return-to-queue control (SRS 3.1.1). */
export function ResultsScreen(props: { view: ResultsView }): JSX.Element {
  throw new NotImplementedError('ResultsScreen render not yet implemented');
}
