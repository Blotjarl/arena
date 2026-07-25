import { AbstractController, NotImplementedError } from '@arena/shared';
import { IdentifyPayload } from '@arena/shared';

/**
 * Handles the initial `identify` handshake for a new connection: validates the requested username and
 * establishes the player's identity for the rest of the session (R1.1–R1.4).
 */
export class PlayerIdentifyController extends AbstractController {
  /**
   * Validates and applies an `identify` request. A connection that has not identified successfully is
   * rejected by ConnectionHandler's dispatch guard for every other event (UnidentifiedConnectionError, R1.4).
   * @param action - the identify action, e.g. 'identify'
   * @param payload - the player id and requested username
   * @throws {InvalidUsernameError} if the username is empty or exceeds 24 characters (R1.1–R1.3)
   */
  operation(action: string, payload?: IdentifyPayload): void {
    throw new NotImplementedError('PlayerIdentifyController.operation not yet implemented');
  }
}
