import { Model } from './Model';
import { ModelEvent } from './ModelEvent';
import { ModelListener } from './ModelListener';

export abstract class AbstractModel implements Model {
  private listeners: ModelListener[] = [];

  addModelListener(listener: ModelListener): void {
    this.listeners.push(listener);
  }

  removeModelListener(listener: ModelListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  notifyChanged(event: ModelEvent): void {
    for (const listener of [...this.listeners]) {
      listener.modelChanged(event);
    }
  }
}
