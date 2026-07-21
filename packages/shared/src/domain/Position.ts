import { NotImplementedError } from '../util/NotImplementedError';

export class Position {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  distanceTo(other: Position): number {
    throw new NotImplementedError('Position.distanceTo not yet implemented');
  }
}
