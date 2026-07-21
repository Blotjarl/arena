import { PlayerId } from './ids';

export class Player {
  constructor(
    public readonly id: PlayerId,
    public readonly username: string,
    public readonly createdAt: Date,
  ) {}
}
