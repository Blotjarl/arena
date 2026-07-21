import { AbstractController, NotImplementedError } from '@arena/shared';

export class DisconnectController extends AbstractController {
  /** @throws GracePeriodExpiredError — owns the grace-period timer (R6.1–R6.4). */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('DisconnectController.operation not yet implemented');
  }
}
