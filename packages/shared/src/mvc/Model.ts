import { ModelEvent } from './ModelEvent';

export interface Model {
  notifyChanged(event: ModelEvent): void;
}
