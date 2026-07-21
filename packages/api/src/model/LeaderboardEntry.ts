import { PlayerId } from '@arena/shared';
import { NotImplementedError } from '@arena/shared';

export class LeaderboardEntry {
  constructor(
    public readonly playerId: PlayerId,
    public readonly username: string,
    public readonly wins: number,
    public readonly losses: number,
    public readonly draws: number,
    public readonly gamesPlayed: number,
    public readonly winRate: number,
  ) {}

  static fromRow(row: Record<string, unknown>): LeaderboardEntry {
    throw new NotImplementedError('LeaderboardEntry.fromRow not yet implemented');
  }
}
