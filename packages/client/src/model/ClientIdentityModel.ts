import { AbstractModel, PlayerId, NotImplementedError } from '@arena/shared';

/**
 * Holds the local player's chosen username and server-assigned PlayerId for the duration of the
 * browser session (R1.1–R1.4). The single source of identity state on the client.
 */
export class ClientIdentityModel extends AbstractModel {
  /** Server-assigned stable identifier; null until identify() completes successfully. */
  public playerId: PlayerId | null = null;

  /** Username submitted by the player; null until identify() completes successfully. */
  public username: string | null = null;

  /**
   * Submits the chosen username to the server and stores the returned PlayerId in sessionStorage
   * so the same identifier survives a page reload within the session (R1.2).
   * @param username - non-empty string, at most 24 characters (R1.1); the server re-validates
   */
  identify(username: string): void {
    throw new NotImplementedError('ClientIdentityModel.identify not yet implemented');
  }

  /**
   * Returns the current PlayerId.
   * @returns the server-assigned PlayerId
   * @throws {PlayerNotFoundError} if called before a successful identify() (playerId is still null)
   */
  getPlayerId(): PlayerId {
    throw new NotImplementedError('ClientIdentityModel.getPlayerId not yet implemented');
  }
}
