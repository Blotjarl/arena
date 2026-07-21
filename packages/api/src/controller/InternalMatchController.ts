import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/** POST /internal/matches/begin and /end — not public-facing; only MatchReportingClient (server package) calls these, over the deployment's private network. */
export class InternalMatchController extends AbstractController {
  async handleBegin(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('InternalMatchController.handleBegin not yet implemented');
  }

  async handleEnd(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('InternalMatchController.handleEnd not yet implemented');
  }

  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('InternalMatchController.operation not yet implemented');
  }
}
