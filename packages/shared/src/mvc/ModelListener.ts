import { ModelEvent } from './ModelEvent';

export interface ModelListener {
  modelChanged(event: ModelEvent): void;
}
