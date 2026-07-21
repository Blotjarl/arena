import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { MatchController } from '../controller/MatchController';
import { InterpolationBuffer } from '../model/InterpolationBuffer';

export class MatchHUDView implements View, ModelListener {
  private onUpdate: (() => void) | null = null;
  private readonly interpolation = new InterpolationBuffer(10);

  constructor(
    private model: ClientMatchModel,
    private controller: MatchController,
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

  getController(): MatchController {
    return this.controller;
  }

  setController(controller: MatchController): void {
    this.controller = controller;
  }

  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchHUDView.modelChanged not yet implemented');
  }
}

/** Health/resource bars, cooldown indicators, arena rendering via InterpolationBuffer (SRS 3.1.1). */
export function MatchHUDScreen(props: { view: MatchHUDView }): JSX.Element {
  throw new NotImplementedError('MatchHUDScreen render not yet implemented');
}
