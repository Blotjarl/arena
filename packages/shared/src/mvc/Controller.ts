import { Model } from './Model';
import { View } from './View';

/** The mediator half of the MVC framework — the only party that touches both a `Model` and a `View`. */
export interface Controller<M extends Model = Model, V extends View<M, any> = View<M, any>> {
  /** @returns the model this controller is mediating for */
  getModel(): M;
  /** @param model - the model this controller should mediate for */
  setModel(model: M): void;
  /** @returns the view this controller is paired with */
  getView(): V;
  /** @param view - the view this controller should be paired with */
  setView(view: V): void;
}
