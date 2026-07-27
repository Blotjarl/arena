import { Player, PlayerId, SOCKET_EVENTS, IdentifyPayload, MovementInput, AbilityUseRequest, ArenaError, UnidentifiedConnectionError, ErrorPayload } from '@arena/shared';
import type { Socket } from 'socket.io';
import { PlayerIdentifyController } from './PlayerIdentifyController';
import { MatchmakingController } from './MatchmakingController';
import { ChampionSelectController } from './ChampionSelectController';
import { CombatController } from './CombatController';
import { DisconnectController } from './DisconnectController';
import { MatchModel } from '../model/MatchModel';
import { MatchBroadcastView } from '../view/MatchBroadcastView';

/**
 * The two controllers every connection has from the moment it connects. CORRECTION (Step 10):
 * `championSelect`/`combat`/`disconnect` are no longer constructor-injected here — those three all need a
 * MatchModel that doesn't exist until this player is paired by matchmaking, which happens on an
 * unpredictable one of the two paired connections. ConnectionHandler now constructs them itself, once
 * paired, via `bindMatch()`.
 */
export interface ConnectionControllers {
  identify: PlayerIdentifyController;
  matchmaking: MatchmakingController;
}

/**
 * Thin Socket.IO transport adapter for one client connection — not an AbstractController. Kept separate
 * from the *Controller classes it dispatches to per 3.6.4 (Maintainability), so game logic remains
 * exercisable by automated tests without a live socket (see master context §4.2). This class contains no
 * game logic of its own; it only binds inbound socket events to the right controller's operation(), and
 * owns the two pieces of per-connection session state (identified player, current match) that the wire
 * contract itself carries no room for.
 */
export class ConnectionHandler {
  private identified = false;
  private player: Player | null = null;
  private championSelect: ChampionSelectController | null = null;
  private combat: CombatController | null = null;
  private disconnect: DisconnectController | null = null;

  constructor(
    private readonly socket: Socket,
    private readonly controllers: ConnectionControllers,
    /** CORRECTION (Step 10): invoked once, right after a successful identify, with the newly-established
     * Player — lets ServerMain register this connection's socket/handler into its own playerId-keyed
     * registries (needed for MatchmakingController's cross-connection `onMatchCreated` wiring, 10_server_2)
     * without adding a second, ordering-fragile `socket.on('identify', ...)` listener alongside this one. */
    private readonly onIdentified?: (player: Player) => void,
  ) {}

  /**
   * Binds this connection's match-scoped controllers once matchmaking pairs its player with an opponent —
   * called by MatchmakingController's `onMatchCreated` callback (10_server_2), once per paired connection.
   * @param match - the newly-created match this connection's player belongs to
   * @param view - that match's broadcast view, shared with the opponent's connection
   */
  bindMatch(match: MatchModel, view: MatchBroadcastView): void {
    this.championSelect = new ChampionSelectController(match, view);
    this.combat = new CombatController(match, view);
    this.disconnect = new DisconnectController(match, view);
  }

  private emitError(err: unknown): void {
    if (err instanceof ArenaError) {
      const payload: ErrorPayload = { code: err.code, message: err.message };
      this.socket.emit(SOCKET_EVENTS.ERROR, payload);
      return;
    }
    throw err;
  }

  private requireIdentified(): boolean {
    if (this.identified && this.player) return true;
    this.emitError(new UnidentifiedConnectionError());
    return false;
  }

  /**
   * Binds `socket.on(eventName, ...)` for every inbound event in the shared contract (`identify`,
   * `queue:join`, `queue:cancel`, `champion:select`, `match:action`, `match:reconnect`, `disconnect`),
   * forwarding each to the matching controller's `operation()`. Every dispatch is wrapped in a uniform
   * try/catch that turns any propagating `ArenaError` into an `error` socket emission — this is generic
   * routing, not per-controller-type logic, so it doesn't conflict with each controller already deciding
   * for itself which failures to swallow vs. let propagate (CombatController vs. ChampionSelectController).
   * Events other than `identify` are gated behind `UnidentifiedConnectionError` until this connection's
   * player has identified successfully (R1.4); `champion:select`/`match:action`/`match:reconnect` are
   * additionally silently ignored (not an error — a normal timing gap, not client misbehavior) before this
   * connection has been paired into a match by `bindMatch()`.
   */
  register(): void {
    this.socket.on(SOCKET_EVENTS.IDENTIFY, (payload: IdentifyPayload) => {
      try {
        this.controllers.identify.operation(SOCKET_EVENTS.IDENTIFY, payload);
        this.player = new Player(payload.playerId, payload.username, new Date());
        this.identified = true;
        this.onIdentified?.(this.player);
      } catch (err) {
        this.emitError(err);
      }
    });

    this.socket.on(SOCKET_EVENTS.QUEUE_JOIN, () => {
      if (!this.requireIdentified()) return;
      try {
        this.controllers.matchmaking.operation(SOCKET_EVENTS.QUEUE_JOIN, { player: this.player! });
      } catch (err) {
        this.emitError(err);
      }
    });

    this.socket.on(SOCKET_EVENTS.QUEUE_CANCEL, () => {
      if (!this.requireIdentified()) return;
      try {
        this.controllers.matchmaking.operation(SOCKET_EVENTS.QUEUE_CANCEL, { player: this.player! });
      } catch (err) {
        this.emitError(err);
      }
    });

    this.socket.on(SOCKET_EVENTS.CHAMPION_SELECT, (payload: { championId: string }) => {
      if (!this.requireIdentified() || !this.championSelect) return;
      try {
        this.championSelect.operation(SOCKET_EVENTS.CHAMPION_SELECT, {
          playerId: this.player!.id,
          championId: payload.championId,
        });
      } catch (err) {
        this.emitError(err);
      }
    });

    this.socket.on(SOCKET_EVENTS.MATCH_ACTION, (payload: MovementInput | AbilityUseRequest) => {
      // No requireIdentified() here, deliberately: match:action fires up to 20x/sec, and CombatController's
      // whole contract is silent-ignore-on-invalid (R4). Erroring on every frame from a not-yet-identified
      // or not-yet-paired connection would be spam, not a meaningful signal — just drop it.
      if (!this.identified || !this.player || !this.combat) return;
      this.combat.operation(SOCKET_EVENTS.MATCH_ACTION, { playerId: this.player.id, input: payload });
    });

    this.socket.on(SOCKET_EVENTS.MATCH_RECONNECT, () => {
      if (!this.requireIdentified() || !this.disconnect) return;
      try {
        this.disconnect.operation(SOCKET_EVENTS.MATCH_RECONNECT, { playerId: this.player!.id });
      } catch (err) {
        this.emitError(err);
      }
    });

    this.socket.on('disconnect', () => {
      if (!this.identified || !this.player || !this.disconnect) return;
      this.disconnect.operation('disconnect', { playerId: this.player.id });
    });
  }
}
