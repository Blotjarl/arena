import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/**
 * `POST /internal/matches/begin` and `/end` — not public-facing; only the server package's
 * `MatchReportingClient` calls these, over the deployment's private network (R7.1, R7.4). Correlates the
 * two-part report via `PendingMatchCorrelator` before persisting through `MatchRepository`.
 */
export class InternalMatchController extends AbstractController {
  /**
   * Handles the match-start half of a report.
   * @param req - Express request carrying the match id and starting participants
   * @param res - Express response, written to directly rather than returned
   * @throws {ValidationError} if the request body fails shape validation (3.6.2)
   */
  async handleBegin(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('InternalMatchController.handleBegin not yet implemented');
  }

  /**
   * Handles the match-end half of a report; once both halves of a matchId are present, persists the
   * completed match via `MatchRepository.recordMatch`.
   * @param req - Express request carrying the match id and outcome
   * @param res - Express response, written to directly rather than returned
   * @throws {ValidationError} if the request body fails shape validation (3.6.2)
   */
  async handleEnd(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('InternalMatchController.handleEnd not yet implemented');
  }

  /**
   * Satisfies the `AbstractController` contract; unused in this controller's own request path, since
   * Express routes call `handleBegin`/`handleEnd` directly rather than dispatching through `operation`.
   * @param action - unused
   * @param payload - unused
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('InternalMatchController.operation not yet implemented');
  }
}
