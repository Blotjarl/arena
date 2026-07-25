import { ModelEvent } from './ModelEvent';

/** Anything that reacts to a `Model`'s push notifications — the Observer role in the MVC push model. */
export interface ModelListener {
  /**
   * Invoked by a `Model` whenever it calls `notifyChanged`.
   * @param event - describes what changed and carries the new state
   */
  modelChanged(event: ModelEvent): void;
}
