import { createServer } from 'node:http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { PlayerId, Player } from '@arena/shared';
import { MatchmakingQueue } from './model/MatchmakingQueue';
import { MatchModel } from './model/MatchModel';
import { TickLoop } from './model/TickLoop';
import { MatchmakingBroadcastView } from './view/MatchmakingBroadcastView';
import { MatchBroadcastView } from './view/MatchBroadcastView';
import { PlayerIdentifyController } from './controller/PlayerIdentifyController';
import { MatchmakingController } from './controller/MatchmakingController';
import { ConnectionHandler } from './controller/ConnectionHandler';
import { MatchReportingClient } from './controller/MatchReportingClient';

const DEFAULT_MAX_CONCURRENT_MATCHES = 50;
const DEFAULT_TICK_RATE_HZ = 20;
const DEFAULT_API_BASE_URL = 'http://localhost:4000';

/** The server subsystem's entry point (SRS 2.1) — wires every server component together and starts listening. */
export class ServerMain {
  /**
   * Creates the HTTP + Socket.IO server, the process-wide MatchmakingQueue and TickLoop, wires a new
   * ConnectionHandler (with its own set of per-connection controllers) for every incoming socket
   * connection, starts TickLoop, and listens on the configured port (R-D7 — no Railway-specific behavior).
   *
   * CORRECTION (Step 10): takes an optional `port` parameter, defaulting to `process.env.PORT` (falling
   * back to 3001) — `docs/01_class_list.md` §5d's zero-arg sketch makes this hard to exercise with a real
   * smoke test without mutating global env vars mid-suite; `port: 0` lets a test ask the OS for a free
   * ephemeral port. `src/index.ts`'s `ServerMain.main()` call is unaffected, since the parameter is optional.
   * @param port - the TCP port to listen on; 0 asks the OS to assign a free port
   */
  static async main(port: number = Number(process.env.PORT) || 3001): Promise<void> {
    const maxConcurrentMatches = Number(process.env.MAX_CONCURRENT_MATCHES) || DEFAULT_MAX_CONCURRENT_MATCHES;

    const httpServer = createServer();
    const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

    const sockets = new Map<PlayerId, Socket>();
    const connectionHandlers = new Map<PlayerId, ConnectionHandler>();
    const queue = new MatchmakingQueue(maxConcurrentMatches);
    const tickLoop = new TickLoop(DEFAULT_TICK_RATE_HZ);
    const matchmakingView = new MatchmakingBroadcastView(queue, sockets);
    // CORRECTION (Step 10, 10_server_9): constructed once for the whole process and shared by every
    // connection's MatchmakingController — closes the R7.1-R7.4 gap where MatchReportingClient's
    // report methods (10_server_6) were implemented and unit-tested but never had a real call site.
    const reportingClient = new MatchReportingClient(process.env.API_BASE_URL || DEFAULT_API_BASE_URL);

    io.on('connection', (socket: Socket) => {
      const identify = new PlayerIdentifyController(queue, matchmakingView);
      const matchmaking = new MatchmakingController(
        queue,
        matchmakingView,
        tickLoop,
        sockets,
        (playerIds: [PlayerId, PlayerId], match: MatchModel, view: MatchBroadcastView) => {
          for (const playerId of playerIds) {
            connectionHandlers.get(playerId)?.bindMatch(match, view);
          }
        },
        reportingClient,
      );
      const handler = new ConnectionHandler(socket, { identify, matchmaking }, (player: Player) => {
        sockets.set(player.id, socket);
        connectionHandlers.set(player.id, handler);
      });
      handler.register();
    });

    tickLoop.start();
    // unref: lets a test process exit without an explicit close() even though the server is still
    // listening — harmless in production, since TickLoop's own setInterval already keeps the event loop
    // alive independently of this handle.
    httpServer.unref();
    await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  }
}
