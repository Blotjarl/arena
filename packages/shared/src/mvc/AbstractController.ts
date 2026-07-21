import { Model } from './Model';
import { View } from './View';
import { Controller } from './Controller';

export abstract class AbstractController<M extends Model = Model, V extends View<M, any> = View<M, any>>
  implements Controller<M, V>
{
  protected model: M;
  protected view: V;

  constructor(model: M, view: V) {
    this.model = model;
    this.view = view;
  }

  getModel(): M {
    return this.model;
  }

  setModel(model: M): void {
    this.model = model;
  }

  getView(): V {
    return this.view;
  }

  setView(view: V): void {
    this.view = view;
  }

  abstract operation(action: string, payload?: unknown): void;
}
