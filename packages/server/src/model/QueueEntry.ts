import { PlayerId } from '@arena/shared';

export class QueueEntry {
  constructor(
    public readonly playerId: PlayerId,
    public readonly username: string,
    public readonly joinedAt: number,
  ) {}
}
