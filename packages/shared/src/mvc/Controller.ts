import { Model } from './Model';
import { View } from './View';

export interface Controller<M extends Model = Model, V extends View<M, any> = View<M, any>> {
  getModel(): M;
  setModel(model: M): void;
  getView(): V;
  setView(view: V): void;
}
