import { Model } from './Model';
import { View } from './View';
import { Controller } from './Controller';

/**
 * Base implementation of `Controller` supplying model/view bookkeeping. Every concrete controller in this
 * codebase extends this and implements `operation` as a dispatcher (switch/if-else over the action string)
 * rather than exposing one method per action.
 */
export abstract class AbstractController<M extends Model = Model, V extends View<M, any> = View<M, any>>
  implements Controller<M, V>
{
  protected model: M;
  protected view: V;

  /**
   * @param model - the model this controller mediates for
   * @param view - the view this controller is paired with
   */
  constructor(model: M, view: V) {
    this.model = model;
    this.view = view;
  }

  /** @returns the model this controller is mediating for */
  getModel(): M {
    return this.model;
  }

  /** @param model - the model this controller should mediate for */
  setModel(model: M): void {
    this.model = model;
  }

  /** @returns the view this controller is paired with */
  getView(): V {
    return this.view;
  }

  /** @param view - the view this controller should be paired with */
  setView(view: V): void {
    this.view = view;
  }

  /**
   * Dispatches a single named action to whatever model/view mutation it implies. Concrete subclasses
   * implement this as a switch/if-else over `action`, per the Calculator/AccountManager pattern.
   * @param action - the action identifier to dispatch on
   * @param payload - the action-specific data, if any
   */
  abstract operation(action: string, payload?: unknown): void;
}
