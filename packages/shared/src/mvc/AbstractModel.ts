import { Model } from './Model';
import { ModelEvent } from './ModelEvent';
import { ModelListener } from './ModelListener';

/**
 * Base implementation of `Model` supplying listener bookkeeping so concrete models only need to call
 * `notifyChanged`. Every domain model in this codebase (`MatchmakingQueue`, `MatchModel`, the three
 * client models) extends this instead of implementing `Model` directly.
 */
export abstract class AbstractModel implements Model {
  private listeners: ModelListener[] = [];

  /** @param listener - the listener to add; will receive future `notifyChanged` events */
  addModelListener(listener: ModelListener): void {
    this.listeners.push(listener);
  }

  /** @param listener - the listener to remove; a no-op if it was never registered */
  removeModelListener(listener: ModelListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * Pushes an event to every currently registered listener. Iterates over a clone of the listener list
   * so a listener that adds/removes another listener mid-notification can't corrupt the iteration.
   * @param event - describes what changed and carries the new state
   */
  notifyChanged(event: ModelEvent): void {
    for (const listener of [...this.listeners]) {
      listener.modelChanged(event);
    }
  }
}
