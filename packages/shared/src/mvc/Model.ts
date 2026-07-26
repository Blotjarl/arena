import { ModelEvent } from './ModelEvent';

/** The observable half of the MVC framework — anything that holds state and pushes change notifications. */
export interface Model {
  /**
   * Pushes a change notification to every registered listener.
   * @param event - describes what changed and carries the new state
   */
  notifyChanged(event: ModelEvent): void;
}
