import { AbstractController, NotImplementedError } from '@arena/shared';

/**
 * Handles queue join/cancel requests against the shared MatchmakingQueue and, on a successful pairing,
 * stands up a new match (R2.1–R2.6).
 */
export class MatchmakingController extends AbstractController {
  /**
   * Dispatches a `queue:join` or `queue:cancel` request. On a successful pairing (queue:join only), this
   * constructs a new MatchModel and MatchBroadcastView for the paired players and registers the match with
   * TickLoop (R2.6) — the pairing itself is MatchmakingQueue's responsibility, not this method's.
   * @param action - 'queue:join' or 'queue:cancel'
   * @param payload - for 'queue:join', the requesting player's identity; empty for 'queue:cancel'
   * @throws {AlreadyQueuedError} if 'queue:join' is called while already queued or in an active match (R2.2)
   * @throws {NotQueuedError} if 'queue:cancel' is called while not currently queued (R2.3)
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchmakingController.operation not yet implemented');
  }
}
