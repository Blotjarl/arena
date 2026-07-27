# Prompt 10_server_6 — ConnectionHandler + MatchReportingClient Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_server_1` through `10_server_5` (all five `*Controller` classes) should be merged first — this is the
adapter that wires all five of them together per-connection. This prompt's own tests mock every controller,
so it can be executed independently, but the real object graph depends on all five existing.

---

### Design notes — two real gaps found by implementing this for real

**1. `championSelect`/`combat`/`disconnect` can't be constructor-injected.** `docs/01_class_list.md` §5b's
original `ConnectionControllers` interface required all five controllers up front. But
`ChampionSelectController`/`CombatController`/`DisconnectController` all need a real `MatchModel`, which
doesn't exist until this player is paired by matchmaking — and pairing can happen on *either* of the two
paired connections, not necessarily this one. **Correction:** `ConnectionControllers` now only requires
`identify` and `matchmaking` (always available at connection time); the other three are constructed by
`ConnectionHandler` itself, inside a new `bindMatch(match, view)` method, called once by
`MatchmakingController`'s `onMatchCreated` callback (`10_server_2`) for each of the two paired connections.
Events for the match-scoped controllers are silently ignored (no error) if they arrive before `bindMatch` —
that's a normal timing gap (the client got `match:found` and started sending actions before the server-side
wiring finished a microtask later), not client misbehavior.

**2. Per-connection session state has to live somewhere, and the wire contract doesn't carry it.** Neither
`queue:join`/`queue:cancel`/`champion:select`/`match:action`/`match:reconnect`/the raw Socket.IO
`disconnect` event carries a `playerId` in its payload (per `packages/shared/src/contract/payloads.ts` —
only `identify` does). `ConnectionHandler` is therefore the one place that must remember "who is this
connection" (`this.player`, set once `identify` succeeds) and inject it into every payload it forwards to a
controller. It's also the one place `UnidentifiedConnectionError` (R1.4) is actually thrown/emitted from,
matching `docs/01_class_list.md` §4's exceptions table ("Thrown by: ConnectionHandler dispatch guard").
`match:action` is the one exception to the identified-gate: it fires up to 20x/sec, and erroring on every
frame from a not-yet-ready connection would be spam, not signal — it's silently dropped instead, matching
`CombatController`'s own silent-ignore philosophy (R4).

The original stub's doc comment claimed `ConnectionHandler` "does not itself catch exceptions thrown by a
controller." In practice, something has to — `MatchmakingController`/`ChampionSelectController`/
`DisconnectController` all legitimately let specific `ArenaError`s propagate (R2.2/R2.3, the one
`InvalidMatchPhaseError` case, R6.4), and an uncaught throw inside a Socket.IO event handler is not
acceptable. The resolution: `ConnectionHandler` wraps each dispatch in one **uniform** try/catch that turns
any `ArenaError` into a generic `error` socket emission — this is transport-layer routing, not
controller-specific business logic, so it doesn't conflict with each controller already deciding for itself
which failures to swallow internally vs. let through.

---

### 1. Replace `packages/server/src/controller/ConnectionHandler.ts` with:

```ts
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
```

### 2. Create `packages/server/src/controller/ConnectionHandler.test.ts` with:

```ts
import { InvalidUsernameError, AlreadyQueuedError, NotQueuedError, InvalidMatchPhaseError, GracePeriodExpiredError } from '@arena/shared';
import { ConnectionHandler } from './ConnectionHandler';
import type { PlayerIdentifyController } from './PlayerIdentifyController';
import type { MatchmakingController } from './MatchmakingController';
import type { MatchModel } from '../model/MatchModel';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';
import type { Socket } from 'socket.io';

function makeFakeSocket() {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const socket = {
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: jest.fn(),
  };
  return { socket: socket as unknown as Socket, handlers, emit: socket.emit };
}

describe('ConnectionHandler', () => {
  describe('identify', () => {
    it('on success, marks the connection identified, invokes onIdentified once, and emits nothing', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const onIdentified = jest.fn();
      const conn = new ConnectionHandler(socket, { identify, matchmaking }, onIdentified);
      conn.register();

      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });
      expect(identify.operation).toHaveBeenCalledWith('identify', { playerId: 'p1', username: 'Alice' });
      expect(onIdentified).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', username: 'Alice' }));
      expect(emit).not.toHaveBeenCalled();

      // Now identified: queue:join should reach the matchmaking controller instead of erroring.
      handlers.get('queue:join')!();
      expect(matchmaking.operation).toHaveBeenCalledWith('queue:join', {
        player: expect.objectContaining({ id: 'p1', username: 'Alice' }),
      });
    });

    it('on InvalidUsernameError, emits a matching error event and leaves the connection unidentified', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = {
        operation: jest.fn(() => {
          throw new InvalidUsernameError('');
        }),
      } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const onIdentified = jest.fn();
      const conn = new ConnectionHandler(socket, { identify, matchmaking }, onIdentified);
      conn.register();

      handlers.get('identify')!({ playerId: 'p1', username: '' });
      expect(emit).toHaveBeenCalledWith('error', { code: 'INVALID_USERNAME', message: expect.any(String) });
      expect(onIdentified).not.toHaveBeenCalled();

      handlers.get('queue:join')!();
      expect(matchmaking.operation).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith('error', { code: 'UNIDENTIFIED_CONNECTION', message: expect.any(String) });
    });
  });

  describe('events before identify', () => {
    it('gates queue:join/queue:cancel/champion:select/match:reconnect behind UnidentifiedConnectionError', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();

      for (const event of ['queue:join', 'queue:cancel', 'champion:select', 'match:reconnect']) {
        emit.mockClear();
        handlers.get(event)!({});
        expect(emit).toHaveBeenCalledWith('error', { code: 'UNIDENTIFIED_CONNECTION', message: expect.any(String) });
      }
      expect(matchmaking.operation).not.toHaveBeenCalled();
    });

    it('silently ignores match:action and the raw disconnect event before identify (no error emitted)', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();

      handlers.get('match:action')!({ dx: 1, dy: 0 });
      expect(emit).not.toHaveBeenCalled();
      handlers.get('disconnect')!();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('queue:join / queue:cancel', () => {
    it('propagates controller exceptions as a targeted error event', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = {
        operation: jest.fn(() => {
          throw new AlreadyQueuedError('p1');
        }),
      } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });

      handlers.get('queue:join')!();
      expect(emit).toHaveBeenCalledWith('error', { code: 'ALREADY_QUEUED', message: expect.any(String) });
    });

    it('queue:cancel also propagates controller exceptions as a targeted error event', () => {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = {
        operation: jest.fn(() => {
          throw new NotQueuedError('p1');
        }),
      } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });

      handlers.get('queue:cancel')!();
      expect(emit).toHaveBeenCalledWith('error', { code: 'NOT_QUEUED', message: expect.any(String) });
    });

    it('re-throws a non-ArenaError rather than swallowing it as a socket error event', () => {
      const { socket, handlers } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = {
        operation: jest.fn(() => {
          throw new Error('programming bug');
        }),
      } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });

      expect(() => handlers.get('queue:join')!()).toThrow('programming bug');
    });
  });

  describe('bindMatch and match-scoped dispatch', () => {
    function identifiedConnection() {
      const { socket, handlers, emit } = makeFakeSocket();
      const identify = { operation: jest.fn() } as unknown as PlayerIdentifyController;
      const matchmaking = { operation: jest.fn() } as unknown as MatchmakingController;
      const conn = new ConnectionHandler(socket, { identify, matchmaking });
      conn.register();
      handlers.get('identify')!({ playerId: 'p1', username: 'Alice' });
      return { conn, handlers, emit };
    }

    it('before bindMatch, silently ignores champion:select and match:action (no error, no throw)', () => {
      const { handlers, emit } = identifiedConnection();
      expect(() => handlers.get('champion:select')!({ championId: 'vex' })).not.toThrow();
      expect(() => handlers.get('match:action')!({ dx: 1, dy: 0 })).not.toThrow();
      expect(emit).not.toHaveBeenCalled();
    });

    it('after bindMatch, forwards champion:select with the connection playerId injected', () => {
      const { conn, handlers } = identifiedConnection();
      const spyMatch = { selectChampion: jest.fn() } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('champion:select')!({ championId: 'vex' });
      expect((spyMatch as any).selectChampion).toHaveBeenCalledWith('p1', 'vex');
    });

    it('after bindMatch, surfaces an InvalidMatchPhaseError from champion:select as an error event (the one case ChampionSelectController lets propagate)', () => {
      const { conn, handlers, emit } = identifiedConnection();
      const spyMatch = {
        selectChampion: jest.fn(() => {
          throw new InvalidMatchPhaseError('m1', 'CHAMPION_SELECT', 'ACTIVE');
        }),
      } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('champion:select')!({ championId: 'vex' });
      expect(emit).toHaveBeenCalledWith('error', { code: 'INVALID_MATCH_PHASE', message: expect.any(String) });
    });

    it('after bindMatch, forwards match:action with the connection playerId injected', () => {
      const { conn, handlers } = identifiedConnection();
      const spyMatch = { submitMove: jest.fn(), submitAbility: jest.fn() } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('match:action')!({ dx: 1, dy: 0 });
      expect((spyMatch as any).submitMove).toHaveBeenCalledWith('p1', { dx: 1, dy: 0 });
    });

    it('after bindMatch, forwards match:reconnect and surfaces GracePeriodExpiredError as an error event', () => {
      const { conn, handlers, emit } = identifiedConnection();
      const spyMatch = {
        reconnect: jest.fn(() => {
          throw new GracePeriodExpiredError('p1', 'm1');
        }),
      } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('match:reconnect')!();
      expect(emit).toHaveBeenCalledWith('error', { code: 'GRACE_PERIOD_EXPIRED', message: expect.any(String) });
    });

    it('after bindMatch, the raw socket disconnect event forwards to DisconnectController', () => {
      const { conn, handlers } = identifiedConnection();
      const spyMatch = { disconnect: jest.fn() } as unknown as MatchModel;
      conn.bindMatch(spyMatch, {} as MatchBroadcastView);
      handlers.get('disconnect')!();
      expect((spyMatch as any).disconnect).toHaveBeenCalledWith('p1');
    });
  });
});
```

---

### 3. Correction to `packages/shared/src/contract/dto.ts` — two new internal DTOs

`docs/01_class_list.md` §5b sketches `MatchReportingClient.reportMatchBegin(matchId, participants:
MatchParticipant[])`, but `MatchParticipant` requires a `result: MatchResult` that genuinely doesn't exist
yet at match-begin time (the match hasn't ended). Add these two DTOs — field-for-field matching
`packages/api/src/model/PendingMatchCorrelator`'s already-implemented `BeginParticipant`/`MatchOutcome`
(`09_api_1`, merged), so a future `10_api_1` (`InternalMatchController.handleBegin`/`handleEnd`) can parse
`req.body` directly into them:

```ts
import { MatchId, PlayerId, ChampionId } from '../domain/ids';
import { Team } from '../domain/Team';
// ...alongside dto.ts's existing EndReason/MatchResult imports

/**
 * CORRECTION (Step 10, `10_server_6`): `MatchReportingClient.reportMatchBegin`'s request body — internal
 * server→api HTTP only, POST /internal/matches/begin (R7.1, R7.4). `docs/01_class_list.md` §5b originally
 * sketched this method's `participants` parameter as `MatchParticipant[]`, but `MatchParticipant` requires
 * a `result: MatchResult` that genuinely doesn't exist yet at match-begin time (the match hasn't ended).
 * This shape — deliberately matching `packages/api/src/model/PendingMatchCorrelator`'s already-implemented
 * `BeginParticipant`/`recordBegin` (09_api_1, merged) field-for-field — is what a future `10_api_1`
 * (`InternalMatchController.handleBegin`) should parse `req.body` into.
 */
export interface MatchBeginReportDTO {
  matchId: MatchId;
  participants: { playerId: PlayerId; team: Team; championId: ChampionId }[];
}

/**
 * CORRECTION (Step 10, `10_server_6`): `MatchReportingClient.reportMatchEnd`'s request body — internal
 * server→api HTTP only, POST /internal/matches/end. Mirrors `PendingMatchCorrelator`'s `MatchOutcome`
 * field-for-field, with `endedAt` as an ISO-8601 string over the wire (same convention as
 * `MatchHistoryEntryDTO.endedAt`) — a future `10_api_1` should `new Date(...)` it back on receipt.
 */
export interface MatchEndReportDTO {
  matchId: MatchId;
  endReason: EndReason;
  winningTeam: Team | null;
  durationMs: number;
  /** ISO-8601 timestamp. */
  endedAt: string;
}
```

This is an addition to `packages/shared/src/contract`, technically Marshall-owned territory already (master
context §2.3/§9.4) — no cross-track flag needed since no other track's prompt currently consumes these two
types, but call this out to whoever writes `10_api_1` later so they use these DTOs rather than hand-rolling
`req.body` parsing.

### 4. Replace `packages/server/src/controller/MatchReportingClient.ts` with:

```ts
import { MatchId, MatchBeginReportDTO, MatchEndReportDTO } from '@arena/shared';

/**
 * Plain HTTP client, not MVC — reports a match's begin/end to packages/api's InternalMatchController
 * (2.3). This is the server's only outbound persistence call; the server never writes to PostgreSQL
 * directly, keeping persistence failures off the hot path of match simulation (3.6.1, R7.4).
 *
 * CORRECTION (Step 10): `docs/01_class_list.md` §5b's original `reportMatchBegin(matchId, participants:
 * MatchParticipant[])` signature is replaced by `MatchBeginReportDTO`/`MatchEndReportDTO` (see
 * `packages/shared/src/contract/dto.ts`) — `MatchParticipant` requires a `result` that doesn't exist yet
 * at match-begin time. See that file's doc comments for the full correction rationale.
 */
export class MatchReportingClient {
  constructor(private readonly apiBaseUrl: string) {}

  private async post(path: string, body: unknown): Promise<void> {
    try {
      const res = await fetch(`${this.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error(`MatchReportingClient: ${path} responded with status ${res.status}`);
      }
    } catch (err) {
      // Log-and-swallow: a reporting outage must never interrupt or crash the live game server process
      // (R7.4). Callers must not `await` this expecting a rejection to signal failure.
      console.error(`MatchReportingClient: ${path} failed`, err);
    }
  }

  /**
   * Reports that a match has begun. Log-and-swallow on failure — network or API errors are logged and
   * never thrown into match simulation, so a reporting outage cannot interrupt or crash the live game
   * server process (R7.4).
   * @param matchId - the match that began
   * @param participants - both participants' team/champion selections, for the eventual match record
   */
  async reportMatchBegin(matchId: MatchId, participants: MatchBeginReportDTO['participants']): Promise<void> {
    await this.post('/internal/matches/begin', { matchId, participants } satisfies MatchBeginReportDTO);
  }

  /**
   * Reports that a match has ended. Log-and-swallow on failure, for the same reason as reportMatchBegin
   * (R7.4) — a lost report only affects match history, never gameplay.
   * @param matchId - the match that ended
   * @param outcome - the end reason, winning team, duration, and end timestamp
   */
  async reportMatchEnd(matchId: MatchId, outcome: Omit<MatchEndReportDTO, 'matchId'>): Promise<void> {
    await this.post('/internal/matches/end', { matchId, ...outcome } satisfies MatchEndReportDTO);
  }
}
```

### 5. Create `packages/server/src/controller/MatchReportingClient.test.ts` with:

```ts
import { Team, EndReason } from '@arena/shared';
import { MatchReportingClient } from './MatchReportingClient';

describe('MatchReportingClient', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('reportMatchBegin', () => {
    it('POSTs the matchId and participants to /internal/matches/begin', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
      const client = new MatchReportingClient('http://api.local');
      await client.reportMatchBegin('m1', [{ playerId: 'p1', team: Team.A, championId: 'vex' }]);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.local/internal/matches/begin',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({ matchId: 'm1', participants: [{ playerId: 'p1', team: Team.A, championId: 'vex' }] });
    });

    it('CRITICAL: a rejected fetch (network failure) does not propagate — resolves rather than throwing', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const client = new MatchReportingClient('http://api.local');

      await expect(client.reportMatchBegin('m1', [])).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('logs but does not throw when the response is a non-2xx status', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const client = new MatchReportingClient('http://api.local');

      await expect(client.reportMatchBegin('m1', [])).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('reportMatchEnd', () => {
    it('POSTs the matchId and outcome to /internal/matches/end', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
      const client = new MatchReportingClient('http://api.local');
      const endedAt = new Date().toISOString();
      await client.reportMatchEnd('m1', { endReason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 5000, endedAt });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.local/internal/matches/end',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({
        matchId: 'm1',
        endReason: EndReason.ELIMINATION,
        winningTeam: Team.A,
        durationMs: 5000,
        endedAt,
      });
    });

    it('CRITICAL: a rejected fetch does not propagate into match simulation', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const client = new MatchReportingClient('http://api.local');

      await expect(
        client.reportMatchEnd('m1', { endReason: EndReason.TIME_LIMIT, winningTeam: null, durationMs: 1, endedAt: '' }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
```

---

### 6. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes. `npx jest ConnectionHandler
--coverage --collectCoverageFrom="src/controller/ConnectionHandler.ts"` — validated result: **13 tests
passing, 100% statement/branch/function/line coverage**. `npx jest MatchReportingClient --coverage
--collectCoverageFrom="src/controller/MatchReportingClient.ts"` — validated result: **5 tests passing, 100%
statement/branch/function/line coverage**, including the two CRITICAL tests (rejected fetch on both begin
and end resolves rather than throwing). Branch `server` from `main` (or reuse an already-checked-out
`server` branch), commit `Step 10: ConnectionHandler + MatchReportingClient implementation and tests,
MatchBeginReportDTO/MatchEndReportDTO contract addition`, push, open a PR into `main`.

**Note on scope:** `MatchReportingClient` is implemented and fully tested here, but **no call site for
`reportMatchBegin`/`reportMatchEnd` exists yet anywhere in the codebase** — wiring it to fire on a match's
`'match:start'`/`'match:end'` events is deliberately left for a future prompt (not scoped to this batch,
whose Step 10 table lists this prompt's scope as just `ConnectionHandler.register` + `MatchReportingClient.
report*`). Do not add that wiring here.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: a failing HTTP call inside `MatchReportingClient` must never propagate.** Both `reportMatchBegin`
and `reportMatchEnd` must resolve (not reject) even when `fetch` itself rejects — verified by the two
CRITICAL tests above. This is R7.4's hard requirement: a reporting outage must never interrupt or crash the
live game server process.
