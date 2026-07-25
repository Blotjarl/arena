import { NotImplementedError } from '@arena/shared';
import type { Socket } from 'socket.io';
import { PlayerIdentifyController } from './PlayerIdentifyController';
import { MatchmakingController } from './MatchmakingController';
import { ChampionSelectController } from './ChampionSelectController';
import { CombatController } from './CombatController';
import { DisconnectController } from './DisconnectController';

/** Typed bundle of the five per-connection controllers ConnectionHandler dispatches inbound events to. */
export interface ConnectionControllers {
  identify: PlayerIdentifyController;
  matchmaking: MatchmakingController;
  championSelect: ChampionSelectController;
  combat: CombatController;
  disconnect: DisconnectController;
}

/**
 * Thin Socket.IO transport adapter for one client connection — not an AbstractController. Kept separate
 * from the *Controller classes it dispatches to per 3.6.4 (Maintainability), so game logic remains
 * exercisable by automated tests without a live socket (see master context §4.2). This class contains no
 * game logic of its own; it only binds inbound socket events to the right controller's operation().
 */
export class ConnectionHandler {
  constructor(
    private readonly socket: Socket,
    private readonly controllers: ConnectionControllers,
  ) {}

  /**
   * Binds `socket.on(eventName, ...)` for every inbound event in the shared contract (`identify`,
   * `queue:join`, `queue:cancel`, `champion:select`, `match:action`, `match:reconnect`, `disconnect`),
   * forwarding each to the matching controller's `operation()`. Does not itself catch exceptions thrown
   * by a controller — each controller is responsible for its own error handling per R4.1/R4.2's
   * swallow-vs-surface split (see CombatController, ChampionSelectController).
   */
  register(): void {
    throw new NotImplementedError('ConnectionHandler.register not yet implemented');
  }
}
