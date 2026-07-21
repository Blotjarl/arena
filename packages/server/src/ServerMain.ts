import { NotImplementedError } from '@arena/shared';

export class ServerMain {
  /** Creates the HTTP + Socket.IO server, MatchmakingQueue, TickLoop; wires ConnectionHandler per connection; starts TickLoop; listens. */
  static async main(): Promise<void> {
    throw new NotImplementedError('ServerMain.main not yet implemented');
  }
}
