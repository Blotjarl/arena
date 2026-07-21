import { Model } from './Model';

export class ModelEvent<T = unknown> {
  constructor(
    public readonly source: Model,
    public readonly type: string,
    public readonly payload: T,
    public readonly timestamp: number = Date.now(),
  ) {}
}
