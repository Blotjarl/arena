import { AbstractController, InvalidUsernameError, SOCKET_EVENTS, IdentifyPayload } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import type { LobbyView } from '../view/LobbyView';
import { SocketConnectionController } from './SocketConnectionController';

/**
 * Generates a client-side session identifier. Prefers `crypto.randomUUID()` (available in every
 * evergreen browser targeted by R-D7); falls back to building a UUIDv4 from `crypto.getRandomValues`
 * for environments (e.g. this project's jsdom-based Jest tests) where `randomUUID` itself is absent
 * but the underlying RNG still is.
 */
function generateClientId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Handles user interactions on the Lobby screen: username submission and queue join/cancel (R1.1, R2.1).
 * Delegates all socket communication to SocketConnectionController.
 */
export class LobbyController extends AbstractController<ClientIdentityModel, LobbyView> {
  /**
   * CORRECTION (Step 10): `docs/01_class_list.md` §6b's constructor sketch only lists `(model, view)`
   * inherited from `AbstractController`, but this controller has nothing to actually emit through without
   * a `SocketConnectionController` reference — the same gap `MatchmakingController` closed on the server
   * side with its extra constructor parameters beyond `(model, view)`.
   * @param model - the identity model this controller mutates on a successful client-side precheck
   * @param view - the paired LobbyView
   * @param socketController - used to emit `identify`/`queue:join`/`queue:cancel` to the server
   */
  constructor(
    model: ClientIdentityModel,
    view: LobbyView,
    private readonly socketController: SocketConnectionController,
  ) {
    super(model, view);
  }

  /**
   * Dispatches a lobby action: 'submitUsername', 'joinQueue', 'cancelQueue', or 'returnToQueue'
   * (the latter used by ResultsScreen's "return to queue" control, per docs/01_class_list.md §6c's
   * documented gap-fill — pairing ResultsView with LobbyController rather than a dedicated controller).
   *
   * For 'submitUsername': performs a client-side UX pre-check that the username is non-empty and
   * at most 24 characters before forwarding to the server (R1.1). **This pre-check is for
   * immediate UI feedback only — the server unconditionally re-validates the same constraints and
   * is the authoritative enforcer. A passing client-side check does not guarantee acceptance.**
   * On success, stores the username on the identity model, generates a client-side session
   * identifier the first time (persisted across reload via ClientIdentityModel's own sessionStorage
   * handling of `arena:playerId`), and forwards an `identify` request to the server.
   *
   * 'joinQueue' and 'returnToQueue' both emit `queue:join` with no payload — the server derives the
   * requesting player from the connection's already-identified state (docs/01_class_list.md §5b,
   * `ConnectionHandler`), not from anything this controller sends. 'cancelQueue' emits `queue:cancel`,
   * also with no payload.
   * @param action - the lobby action to dispatch
   * @param payload - for 'submitUsername', the username string; omitted for queue actions
   * @throws {InvalidUsernameError} if 'submitUsername' fails the client-side precheck (R1.1)
   */
  operation(action: string, payload?: { username: string }): void {
    switch (action) {
      case 'submitUsername': {
        const username = payload?.username ?? '';
        if (username.trim().length === 0 || username.length > 24) {
          throw new InvalidUsernameError(username);
        }
        this.model.identify(username);
        if (this.model.playerId === null) {
          this.model.playerId = generateClientId();
          const storage: Storage | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
          storage?.setItem('arena:playerId', this.model.playerId);
        }
        const identifyPayload: IdentifyPayload = { playerId: this.model.playerId, username };
        this.socketController.operation(SOCKET_EVENTS.IDENTIFY, identifyPayload);
        break;
      }
      case 'joinQueue':
      case 'returnToQueue':
        this.socketController.operation(SOCKET_EVENTS.QUEUE_JOIN);
        break;
      case 'cancelQueue':
        this.socketController.operation(SOCKET_EVENTS.QUEUE_CANCEL);
        break;
    }
  }
}
