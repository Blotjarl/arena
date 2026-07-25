import { AbstractController, NotImplementedError } from '@arena/shared';

/**
 * Handles user interactions on the Lobby screen: username submission and queue join/cancel (R1.1, R2.1).
 * Delegates all socket communication to SocketConnectionController.
 */
export class LobbyController extends AbstractController {
  /**
   * Dispatches a lobby action (e.g. 'submitUsername', 'joinQueue', 'cancelQueue').
   *
   * For 'submitUsername': performs a client-side UX pre-check that the username is non-empty and
   * at most 24 characters before forwarding to the server (R1.1). **This pre-check is for
   * immediate UI feedback only — the server unconditionally re-validates the same constraints and
   * is the authoritative enforcer. A passing client-side check does not guarantee acceptance.**
   * @param action - the lobby action to dispatch
   * @param payload - for 'submitUsername', the username string; omitted for queue actions
   */
  operation(action: string, payload?: { username: string }): void {
    throw new NotImplementedError('LobbyController.operation not yet implemented');
  }
}
