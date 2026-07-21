import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/** `GET /players/:id/matches?page=&pageSize=` — serves a player's paginated match history (R7.3). */
export class MatchHistoryController extends AbstractController {
  /**
   * Fetches a page of match history via `MatchRepository.findHistoryForPlayer` and formats it through
   * `MatchHistoryResponseView`.
   * @param req - Express request carrying the player id and pagination params
   * @param res - Express response, written to directly rather than returned
   * @throws {ValidationError} if `page`/`pageSize` are missing or not positive integers (3.6.2)
   */
  async getHistory(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('MatchHistoryController.getHistory not yet implemented');
  }

  /**
   * Satisfies the `AbstractController` contract; unused in this controller's own request path, since the
   * Express route calls `getHistory` directly rather than dispatching through `operation`.
   * @param action - unused
   * @param payload - unused
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchHistoryController.operation not yet implemented');
  }
}
