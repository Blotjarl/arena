import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/** GET /leaderboard, GET /leaderboard/champions (R8.1–R8.3). */
export class LeaderboardController extends AbstractController {
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('LeaderboardController.getLeaderboard not yet implemented');
  }

  async getChampionWinRates(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('LeaderboardController.getChampionWinRates not yet implemented');
  }

  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('LeaderboardController.operation not yet implemented');
  }
}
