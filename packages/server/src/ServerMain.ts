import { NotImplementedError } from '@arena/shared';

/** The server subsystem's entry point (SRS 2.1) — wires every server component together and starts listening. */
export class ServerMain {
  /**
   * Creates the HTTP + Socket.IO server, the process-wide MatchmakingQueue and TickLoop, wires a new
   * ConnectionHandler (with its own set of per-connection controllers) for every incoming socket
   * connection, starts TickLoop, and listens on the configured port (R-D7 — no Railway-specific behavior).
   */
  static async main(): Promise<void> {
    throw new NotImplementedError('ServerMain.main not yet implemented');
  }
}
