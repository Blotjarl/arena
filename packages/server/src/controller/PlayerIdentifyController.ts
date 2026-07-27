import { AbstractController, IdentifyPayload, InvalidUsernameError } from '@arena/shared';

/**
 * Handles the initial `identify` handshake for a new connection: validates the requested username and
 * establishes the player's identity for the rest of the session (R1.1–R1.4).
 *
 * Uses the default (untyped) `AbstractController` generics deliberately — there is no domain Model this
 * controller mutates and no wire event acknowledging a successful identify (SRS Appendix A has no
 * `identified` event), so `model`/`view` are structurally required by `AbstractController` but not used by
 * `operation`. ServerMain supplies the process-wide `MatchmakingQueue`/`MatchmakingBroadcastView` as
 * harmless stand-ins, since real per-player identity tracking (marking a connection identified, building
 * its `Player`) lives on `ConnectionHandler` — the one place a socket's session state persists across
 * events (see `10_server_6`).
 */
export class PlayerIdentifyController extends AbstractController {
  /**
   * Validates an `identify` request. A connection that has not identified successfully is rejected by
   * ConnectionHandler's dispatch guard for every other event (UnidentifiedConnectionError, R1.4).
   * @param action - the identify action, e.g. 'identify'
   * @param payload - the player id and requested username
   * @throws {InvalidUsernameError} if the username is empty or exceeds 24 characters (R1.1–R1.3)
   */
  operation(action: string, payload?: IdentifyPayload): void {
    const username = payload?.username ?? '';
    if (username.length < 1 || username.length > 24) {
      throw new InvalidUsernameError(username);
    }
  }
}
