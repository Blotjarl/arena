import { AbstractController, NotImplementedError } from '@arena/shared';

export class MatchmakingController extends AbstractController {
  /** @throws AlreadyQueuedError | NotQueuedError — on pairing, constructs a new MatchModel + MatchBroadcastView (R2.6). */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchmakingController.operation not yet implemented');
  }
}
