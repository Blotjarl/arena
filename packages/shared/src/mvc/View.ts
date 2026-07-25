import { Model } from './Model';
import { Controller } from './Controller';

/**
 * The presentation half of the MVC framework. Each subsystem supplies its own concrete realization
 * (Socket.IO broadcaster, React screen, HTTP response formatter) — there is no shared `JFrameView`
 * equivalent, since Arena has no desktop GUI.
 */
export interface View<M extends Model = Model, C extends Controller<M, any> = Controller<M, any>> {
  /** @returns the model this view renders */
  getModel(): M;
  /** @param model - the model this view should render */
  setModel(model: M): void;
  /** @returns the controller this view is paired with */
  getController(): C;
  /** @param controller - the controller this view should be paired with */
  setController(controller: C): void;
}
