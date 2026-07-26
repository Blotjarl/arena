import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/** `GET /leaderboard` and `GET /leaderboard/champions` — serves aggregate standings (R8.1–R8.3). */
export class LeaderboardController extends AbstractController {
  /**
   * Fetches leaderboard standings via `LeaderboardRepository.computeLeaderboard` and formats them through
   * `LeaderboardResponseView`.
   * @param req - Express request, optionally carrying a `minGames` query param
   * @param res - Express response, written to directly rather than returned
   * @throws {ValidationError} if `minGames` is present but not a non-negative integer (3.6.2)
   */
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('LeaderboardController.getLeaderboard not yet implemented');
  }

  /**
   * Fetches per-champion win rates via `LeaderboardRepository.computeChampionWinRates`.
   * @param req - Express request
   * @param res - Express response, written to directly rather than returned
   */
  async getChampionWinRates(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('LeaderboardController.getChampionWinRates not yet implemented');
  }

  /**
   * Satisfies the `AbstractController` contract; unused in this controller's own request path, since
   * Express routes call `getLeaderboard`/`getChampionWinRates` directly rather than dispatching through
   * `operation`.
   * @param action - unused
   * @param payload - unused
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('LeaderboardController.operation not yet implemented');
  }
}
