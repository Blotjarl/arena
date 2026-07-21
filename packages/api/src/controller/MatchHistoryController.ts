import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/** GET /players/:id/matches?page=&pageSize= (R7.3). */
export class MatchHistoryController extends AbstractController {
  async getHistory(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('MatchHistoryController.getHistory not yet implemented');
  }

  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchHistoryController.operation not yet implemented');
  }
}
