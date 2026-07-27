# Prompt 10_server_8 — ServerMain Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
This prompt is the last in the batch, on purpose — it wires together every other `10_server_*` component.
`10_server_1` through `10_server_7` must all be merged first.

---

### Design notes

**Closing the cross-connection wiring loop.** `MatchmakingController` (`10_server_2`) needs an
`onMatchCreated` callback to reach the *other* paired player's `ConnectionHandler.bindMatch()`, since a
pairing can be triggered from either connection. `ServerMain` is where that callback is finally supplied —
it's the one place with a `Map<PlayerId, ConnectionHandler>` spanning every connection. Similarly,
`ConnectionHandler`'s `onIdentified` callback (`10_server_6`) is what populates that map (and the
`sockets` map both broadcast views need) in the first place, once a connection actually identifies —
avoiding a second, ordering-fragile `socket.on('identify', ...)` listener.

**`port` parameter correction.** `docs/01_class_list.md` §5d's zero-arg `static async main(): Promise<void>`
sketch is hard to smoke-test without mutating `process.env.PORT` mid-suite. `main()` now takes an optional
`port` parameter defaulting to `process.env.PORT` (or 3001) — `src/index.ts`'s existing zero-arg
`ServerMain.main()` call is unaffected, and a test can pass `0` to ask the OS for a free ephemeral port.

**`httpServer.unref()`.** Lets a test process exit cleanly without an explicit `close()` call, even though
the server is still listening — harmless in production, since `TickLoop`'s own `setInterval` already keeps
the Node event loop alive independently of this handle.

**`MatchReportingClient` is intentionally not constructed here.** Per `10_server_6`'s closing note, no call
site for it exists yet anywhere in the codebase; wiring it in is future work, not this prompt's job.

**Why this method's test is a smoke test, not a full unit test.** `docs/ProjectProcess.txt`/the
implementation plan both accept that a wiring/bootstrap method like this doesn't warrant deep unit testing
— the real value is in the components it wires (already tested individually in `10_server_1`–`7`). One test
asserting `main()` resolves without throwing, on a free OS-assigned port (`0`), is enough. Don't add
per-branch coverage of the `io.on('connection', ...)` callback body here; that would mean spinning up a real
Socket.IO client just to exercise wiring code, for marginal value over what the individual controller/view
tests already cover.

---

### 1. Replace `packages/server/src/ServerMain.ts` with:

```ts
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

const DEFAULT_MAX_CONCURRENT_MATCHES = 50;
const DEFAULT_TICK_RATE_HZ = 20;

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
    // MatchReportingClient is deliberately not constructed/wired here — its two report methods are
    // implemented and unit-tested (10_server_6), but no call site exists yet in this batch; see that
    // prompt's closing note.

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
```

### 2. Create `packages/server/src/ServerMain.test.ts` with:

```ts
import { ServerMain } from './ServerMain';

describe('ServerMain', () => {
  describe('main', () => {
    it('starts listening on a free port without throwing (smoke test — see class doc comment)', async () => {
      await expect(ServerMain.main(0)).resolves.toBeUndefined();
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest ServerMain --coverage
--collectCoverageFrom="src/ServerMain.ts" --forceExit` — validated result: **1 test passing, 75%
statement / 40% branch / 40% function / 74.19% line coverage** (uncovered: the `io.on('connection', ...)`
callback body — never exercised without a real socket connecting, which this smoke test deliberately
doesn't do; see the design note above). **Use `--forceExit`** when running this file in isolation — `main()`
starts a real (unref'd) `TickLoop` interval and HTTP listener that Jest's default runner will otherwise wait
on indefinitely; this is not needed when running the full `npm test -w @arena/server` suite, since Jest's
own worker pool already force-exits after all suites complete. Also run the **full package regression**
once this lands: `npx jest --coverage` — validated result at the point this prompt was written: **136 tests
passing across 14 suites** (all of `10_server_1` through `10_server_8`'s components plus the pre-existing
model package), confirming this final wiring pass didn't regress anything upstream. Branch `server` from
`main` (or reuse an already-checked-out `server` branch), commit `Step 10: ServerMain implementation and
smoke test — server controller/view package complete`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: do not over-engineer this prompt's test.** A wiring/bootstrap method's value is in the
components it wires, all already unit-tested individually in `10_server_1` through `10_server_7`. Resist
the urge to add a real Socket.IO client, simulate a full match, or chase branch coverage on the
`io.on('connection', ...)` callback here — that duplicates coverage the earlier prompts already have and
adds a slow, flaky integration test in place of what's supposed to be a fast smoke check.
