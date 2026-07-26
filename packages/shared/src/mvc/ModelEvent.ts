import { Model } from './Model';

/** A single change notification pushed from a `Model` to its `ModelListener`s. */
export class ModelEvent<T = unknown> {
  constructor(
    /** The `Model` that produced this event. */
    public readonly source: Model,
    /** A discriminator identifying what kind of change occurred (e.g. `'state'`). */
    public readonly type: string,
    /** The new state or data associated with the change. */
    public readonly payload: T,
    /** When the event was created, in epoch milliseconds. */
    public readonly timestamp: number = Date.now(),
  ) {}
}
