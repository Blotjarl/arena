import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { ChampionSelectController } from '../controller/ChampionSelectController';

export class ChampionSelectView implements View, ModelListener {
  private onUpdate: (() => void) | null = null;

  constructor(
    private model: ClientMatchModel,
    private controller: ChampionSelectController,
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

  getController(): ChampionSelectController {
    return this.controller;
  }

  setController(controller: ChampionSelectController): void {
    this.controller = controller;
  }

  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('ChampionSelectView.modelChanged not yet implemented');
  }
}

/** Both players, selection countdown, roster with stats/abilities (SRS 3.1.1). */
export function ChampionSelectScreen(props: { view: ChampionSelectView }): JSX.Element {
  throw new NotImplementedError('ChampionSelectScreen render not yet implemented');
}
