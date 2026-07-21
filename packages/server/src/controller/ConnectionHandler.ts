import { NotImplementedError } from '@arena/shared';
import type { Socket } from 'socket.io';
import { PlayerIdentifyController } from './PlayerIdentifyController';
import { MatchmakingController } from './MatchmakingController';
import { ChampionSelectController } from './ChampionSelectController';
import { CombatController } from './CombatController';
import { DisconnectController } from './DisconnectController';

export interface ConnectionControllers {
  identify: PlayerIdentifyController;
  matchmaking: MatchmakingController;
  championSelect: ChampionSelectController;
  combat: CombatController;
  disconnect: DisconnectController;
}

export class ConnectionHandler {
  constructor(
    private readonly socket: Socket,
    private readonly controllers: ConnectionControllers,
  ) {}

  /** Binds socket.on(eventName, ...) for every inbound event in SOCKET_EVENTS, forwarding to the matching controller's operation(). */
  register(): void {
    throw new NotImplementedError('ConnectionHandler.register not yet implemented');
  }
}
