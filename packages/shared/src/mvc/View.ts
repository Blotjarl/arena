import { Model } from './Model';
import { Controller } from './Controller';

export interface View<M extends Model = Model, C extends Controller<M, any> = Controller<M, any>> {
  getModel(): M;
  setModel(model: M): void;
  getController(): C;
  setController(controller: C): void;
}
