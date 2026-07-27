# Prompt 10_server_2 — MatchmakingController Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL: this is the one place a new MatchModel gets constructed
Per `prompts/09-10_implementation_plan.md` §4's Step 10 table, this controller — on a successful pairing —
constructs a real `MatchModel` + `MatchBroadcastView`, registers the match with `TickLoop`, **and** must
also unregister it once the match ends (nothing else in this batch owns that half of the lifecycle). Get
its test coverage of both halves of that wiring right; nothing else in the batch exercises it.

---

### Design notes — three corrections discovered by implementing this for real

**1. `MatchmakingQueue.join`/`cancel` needed a `playerId` in their broadcast payload.**
`MatchmakingBroadcastView` (`10_server_7`) must route `queue:joined`/`queue:cancelled` to the one socket
that triggered them, but the already-merged `MatchmakingQueue.join()`/`cancel()` (`09_server_1`) only ever
called `notifyChanged` with `{position}` / `{}` — no player to route to. Fixed directly in
`packages/server/src/model/MatchmakingQueue.ts` (step 0 below) — this is an internal `ModelEvent` payload
detail, not a wire-contract change (the actual socket emission, built by the view, still matches
`QueueJoinedPayload`/`QueueCancelledPayload` exactly), so it does not trigger master context §8's
contract-drift flag.

**2. `match:found` needs per-player routing too, and the model deliberately never auto-broadcasts it.**
`MatchFoundPayload` has no `playerId` field (it differs per player: `team`, `opponentUsername`), and
`MatchmakingQueue.tryPairNext()`'s own doc comment already documents that it does **not** call
`notifyChanged` for a pairing — the real `MatchModel` doesn't exist until this controller builds it. So this
controller calls `MatchmakingBroadcastView.modelChanged()` **directly**, twice — once per paired player —
with a `{playerId, ...MatchFoundPayload}` event. The view (`10_server_7`) strips `playerId` back out before
emitting, so the wire payload still matches the documented `MatchFoundPayload` shape exactly.

**3. `ChampionSelectController`/`CombatController`/`DisconnectController` need a `MatchModel` that doesn't
exist yet at connection time.** Those three all require a real `MatchModel`+`MatchBroadcastView`, but a
connection's `ConnectionHandler` is built before any match exists. Rather than inventing a new registry
class, this controller takes a constructor-injected `onMatchCreated` callback — `ServerMain` (`10_server_8`)
supplies it, closing over its own `Map<PlayerId, ConnectionHandler>`, and uses it to call
`ConnectionHandler.bindMatch(match, view)` on each of the two paired connections (`10_server_6`). This
keeps `MatchmakingController` itself fully unit-testable (the callback is just a `jest.fn()` in tests) while
keeping the cross-connection wiring out of this controller's own responsibility.

**4. `MatchFoundBroadcast` (the per-player `match:found` routing type) is defined here, in
`MatchmakingController.ts` — not in `MatchmakingBroadcastView.ts`.** This controller is the one place a
`match:found` event actually gets constructed and emitted, so it owns the type. This matters for execution
order: `10_server_7` (broadcast views) already declares `10_server_2` as a prerequisite, so it's safe for
`MatchmakingBroadcastView.ts` to `import type { MatchFoundBroadcast } from '../controller/MatchmakingController'`
once it exists. The reverse — this file importing a type from `MatchmakingBroadcastView.ts` — would only
work by accident (it happened to compile when everything was implemented together in one session) and
breaks the moment this prompt is run in the batch's actual intended order, before `10_server_7` exists:
`MatchmakingBroadcastView.ts` is still the original stub, which exports no such type. If you're executing
this prompt against a repo where `MatchmakingBroadcastView.ts`/`MatchBroadcastView.ts` are still
`NotImplementedError` stubs (the normal case — `10_server_2` does not require `10_server_7` first), that is
expected and fine; this prompt's own code and tests never call into those two views' `modelChanged`.

---

### 0. Correction to `packages/server/src/model/MatchmakingQueue.ts` — add `playerId` to two broadcasts

In `join()`, change:
```ts
this.notifyChanged(new ModelEvent(this, 'queue:joined', { position }));
```
to:
```ts
this.notifyChanged(new ModelEvent(this, 'queue:joined', { playerId: player.id, position }));
```

In `cancel()`, change:
```ts
this.notifyChanged(new ModelEvent(this, 'queue:cancelled', {}));
```
to:
```ts
this.notifyChanged(new ModelEvent(this, 'queue:cancelled', { playerId }));
```

And update the two existing assertions in `packages/server/src/model/MatchmakingQueue.test.ts` accordingly:
```ts
expect(events).toEqual([{ type: 'queue:joined', payload: { playerId: 'p1', position: 1 } }]);
```
```ts
expect(events).toEqual([{ type: 'queue:cancelled', payload: { playerId: 'p1' } }]);
```

### 1. Replace `packages/server/src/controller/MatchmakingController.ts` with:

```ts
import { AbstractController, ModelEvent, Player, PlayerId, Team, ChampionRoster, SOCKET_EVENTS, MatchFoundPayload } from '@arena/shared';
import type { Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { MatchmakingQueue } from '../model/MatchmakingQueue';
import { MatchModel } from '../model/MatchModel';
import { TickLoop } from '../model/TickLoop';
import { MatchmakingBroadcastView } from '../view/MatchmakingBroadcastView';
import { MatchBroadcastView } from '../view/MatchBroadcastView';

/** Payload ConnectionHandler forwards for `queue:join`/`queue:cancel` — the connection's identified player. */
export interface MatchmakingRequest {
  player: Player;
}

/** A `match:found` broadcast, addressed to one specific player. Owned here (not in MatchmakingBroadcastView) so this controller has no compile-time dependency on 10_server_7's view implementation — MatchmakingBroadcastView imports this type back, not the other way around (see design note 4 above). */
export type MatchFoundBroadcast = MatchFoundPayload & { playerId: PlayerId };

/** Invoked once per newly-paired match, so the caller (ConnectionHandler/ServerMain) can bind the two players' championSelect/combat/disconnect controllers to it — see 10_server_6. */
export type OnMatchCreated = (playerIds: [PlayerId, PlayerId], match: MatchModel, view: MatchBroadcastView) => void;

/**
 * Handles queue join/cancel requests against the shared MatchmakingQueue and, on a successful pairing,
 * stands up a new match (R2.1–R2.6).
 */
export class MatchmakingController extends AbstractController {
  constructor(
    model: MatchmakingQueue,
    view: MatchmakingBroadcastView,
    private readonly tickLoop: TickLoop,
    /** Every currently-connected player's socket, keyed by playerId — shared with the broadcast views, so a freshly-built MatchBroadcastView can target this match's two participants. */
    private readonly sockets: Map<PlayerId, Socket>,
    /** CORRECTION (Step 10): cross-connection wiring callback — see OnMatchCreated doc above. Not part of docs/01_class_list.md's original constructor sketch, added because ChampionSelectController/CombatController/DisconnectController require a MatchModel that doesn't exist until pairing happens on (from either player's perspective) only one of the two connections. */
    private readonly onMatchCreated: OnMatchCreated,
  ) {
    super(model, view);
  }

  /**
   * Dispatches a `queue:join` or `queue:cancel` request. On a successful pairing (queue:join only), this
   * constructs a new MatchModel and MatchBroadcastView for the paired players and registers the match with
   * TickLoop (R2.6) — the pairing itself is MatchmakingQueue's responsibility, not this method's.
   * @param action - 'queue:join' or 'queue:cancel'
   * @param payload - for 'queue:join', the requesting player's identity; empty for 'queue:cancel'
   * @throws {AlreadyQueuedError} if 'queue:join' is called while already queued or in an active match (R2.2)
   * @throws {NotQueuedError} if 'queue:cancel' is called while not currently queued (R2.3)
   */
  operation(action: string, payload?: MatchmakingRequest): void {
    const queue = this.model as MatchmakingQueue;

    if (action === SOCKET_EVENTS.QUEUE_CANCEL) {
      queue.cancel(payload!.player.id);
      return;
    }

    // 'queue:join' — MatchmakingQueue.join() itself broadcasts 'queue:joined' via the Observer mechanism.
    queue.join(payload!.player);
    const pair = queue.tryPairNext();
    if (!pair) return;
    this.createMatch(pair[0].playerId, pair[0].username, pair[1].playerId, pair[1].username);
  }

  private createMatch(playerIdA: PlayerId, usernameA: string, playerIdB: PlayerId, usernameB: string): void {
    const view = this.view as MatchmakingBroadcastView;
    const matchId = randomUUID();
    const playerA = new Player(playerIdA, usernameA, new Date());
    const playerB = new Player(playerIdB, usernameB, new Date());
    const match = new MatchModel(matchId, [playerA, playerB]);
    const matchBroadcastView = new MatchBroadcastView(match, this.sockets);

    this.tickLoop.register(match);
    // CORRECTION (Step 10): MatchBroadcastView has no TickLoop reference (docs/01_class_list.md §5c
    // constructor is (model, sockets) only), so nothing else unregisters a finished match. This listener
    // is the match's cleanup — added here, alongside registration, since this is the one place both halves
    // of the match's TickLoop lifecycle are naturally symmetric.
    match.addModelListener({
      modelChanged: (event) => {
        if (event.type === 'match:end') this.tickLoop.unregister(match.id);
      },
    });

    const roster = ChampionRoster.getAll();
    const foundA: MatchFoundBroadcast = {
      playerId: playerIdA,
      matchId,
      team: Team.A,
      opponentUsername: usernameB,
      roster,
    };
    const foundB: MatchFoundBroadcast = {
      playerId: playerIdB,
      matchId,
      team: Team.B,
      opponentUsername: usernameA,
      roster,
    };
    view.modelChanged(new ModelEvent(this.model as MatchmakingQueue, 'match:found', foundA));
    view.modelChanged(new ModelEvent(this.model as MatchmakingQueue, 'match:found', foundB));

    this.onMatchCreated([playerIdA, playerIdB], match, matchBroadcastView);
  }
}
```

### 2. Create `packages/server/src/controller/MatchmakingController.test.ts` with:

```ts
import { AlreadyQueuedError, NotQueuedError, Team, ModelEvent, Player } from '@arena/shared';
import { MatchmakingController } from './MatchmakingController';
import { MatchModel } from '../model/MatchModel';
import { TickLoop } from '../model/TickLoop';
import type { MatchmakingQueue } from '../model/MatchmakingQueue';
import type { MatchmakingBroadcastView } from '../view/MatchmakingBroadcastView';
import type { Socket } from 'socket.io';
import { QueueEntry } from '../model/QueueEntry';

function makeQueue(overrides: Partial<MatchmakingQueue> = {}): MatchmakingQueue {
  return {
    join: jest.fn(),
    cancel: jest.fn(),
    tryPairNext: jest.fn(() => null),
    ...overrides,
  } as unknown as MatchmakingQueue;
}

function makeView(): MatchmakingBroadcastView & { modelChanged: jest.Mock } {
  return { modelChanged: jest.fn() } as unknown as MatchmakingBroadcastView & { modelChanged: jest.Mock };
}

function makeSockets(): Map<string, Socket> {
  return new Map([
    ['p1', { emit: jest.fn() } as unknown as Socket],
    ['p2', { emit: jest.fn() } as unknown as Socket],
  ]);
}

describe('MatchmakingController', () => {
  describe('queue:join', () => {
    it('delegates to MatchmakingQueue.join and does nothing further when no pairing occurs', () => {
      const queue = makeQueue();
      const view = makeView();
      const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
      const onMatchCreated = jest.fn();
      const controller = new MatchmakingController(queue, view, tickLoop, makeSockets(), onMatchCreated);

      const player = new Player('p1', 'Alice', new Date());
      controller.operation('queue:join', { player });

      expect(queue.join).toHaveBeenCalledWith(player);
      expect(tickLoop.register).not.toHaveBeenCalled();
      expect(onMatchCreated).not.toHaveBeenCalled();
      expect(view.modelChanged).not.toHaveBeenCalled();
    });

    it('propagates AlreadyQueuedError uncaught', () => {
      const queue = makeQueue({
        join: jest.fn(() => {
          throw new AlreadyQueuedError('p1');
        }),
      });
      const controller = new MatchmakingController(
        queue,
        makeView(),
        { register: jest.fn() } as unknown as TickLoop,
        makeSockets(),
        jest.fn(),
      );
      expect(() => controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) })).toThrow(
        AlreadyQueuedError,
      );
    });

    describe('CRITICAL CHECKPOINT — on a successful pairing, builds a real MatchModel and registers it with TickLoop', () => {
      it('constructs one MatchModel, registers it with TickLoop exactly once, and wires the two participants', () => {
        const pair: [QueueEntry, QueueEntry] = [new QueueEntry('p1', 'Alice', 1000), new QueueEntry('p2', 'Bob', 1001)];
        const queue = makeQueue({ tryPairNext: jest.fn(() => pair) });
        const view = makeView();
        const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
        const onMatchCreated = jest.fn();
        const sockets = makeSockets();
        const controller = new MatchmakingController(queue, view, tickLoop, sockets, onMatchCreated);

        controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) });

        expect(tickLoop.register).toHaveBeenCalledTimes(1);
        const registeredMatch = (tickLoop.register as jest.Mock).mock.calls[0][0] as MatchModel;
        expect(registeredMatch).toBeInstanceOf(MatchModel);

        expect(onMatchCreated).toHaveBeenCalledTimes(1);
        const [playerIds, match, matchView] = onMatchCreated.mock.calls[0];
        expect(playerIds).toEqual(['p1', 'p2']);
        expect(match).toBe(registeredMatch);
        expect(matchView.getModel()).toBe(match);
      });

      it('assigns Team A to the first-paired entry and Team B to the second, and broadcasts match:found to each with the correct opponent', () => {
        const pair: [QueueEntry, QueueEntry] = [new QueueEntry('p1', 'Alice', 1000), new QueueEntry('p2', 'Bob', 1001)];
        const queue = makeQueue({ tryPairNext: jest.fn(() => pair) });
        const view = makeView();
        const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
        const controller = new MatchmakingController(queue, view, tickLoop, makeSockets(), jest.fn());

        controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) });

        expect(view.modelChanged).toHaveBeenCalledTimes(2);
        const events = view.modelChanged.mock.calls.map((c) => c[0] as ModelEvent);
        expect(events.every((e) => e.type === 'match:found')).toBe(true);

        const forA = events.find((e) => (e.payload as { playerId: string }).playerId === 'p1')!.payload as any;
        const forB = events.find((e) => (e.payload as { playerId: string }).playerId === 'p2')!.payload as any;
        expect(forA.team).toBe(Team.A);
        expect(forA.opponentUsername).toBe('Bob');
        expect(forB.team).toBe(Team.B);
        expect(forB.opponentUsername).toBe('Alice');
        expect(forA.matchId).toBe(forB.matchId);
        expect(forA.roster.length).toBeGreaterThan(0);
      });

      it('CRITICAL CHECKPOINT: unregisters the match from TickLoop once it ends, without ever invoking MatchBroadcastView.modelChanged (may still be an unimplemented stub, 10_server_7)', () => {
        const addListenerSpy = jest.spyOn(MatchModel.prototype, 'addModelListener');
        const pair: [QueueEntry, QueueEntry] = [new QueueEntry('p1', 'Alice', 1000), new QueueEntry('p2', 'Bob', 1001)];
        const queue = makeQueue({ tryPairNext: jest.fn(() => pair) });
        const view = makeView();
        const tickLoop = { register: jest.fn(), unregister: jest.fn() } as unknown as TickLoop;
        const onMatchCreated = jest.fn();
        const controller = new MatchmakingController(queue, view, tickLoop, makeSockets(), onMatchCreated);

        controller.operation('queue:join', { player: new Player('p1', 'Alice', new Date()) });
        const match = (tickLoop.register as jest.Mock).mock.calls[0][0] as MatchModel;
        const matchBroadcastView = onMatchCreated.mock.calls[0][2];

        // MatchmakingController registers exactly two listeners on the new match: MatchBroadcastView's own
        // (in its constructor) and this cleanup listener. Identify the cleanup listener by elimination
        // rather than by invoking every captured listener's modelChanged — MatchBroadcastView.modelChanged
        // may still be an unimplemented NotImplementedError stub when this prompt is run in the batch's
        // intended dependency order (10_server_2 does not require 10_server_7 first).
        const cleanupListener = addListenerSpy.mock.calls.map(([l]) => l).find((l) => l !== matchBroadcastView);
        expect(cleanupListener).toBeDefined();

        cleanupListener!.modelChanged(new ModelEvent(match, 'match:end', {}));
        expect(tickLoop.unregister).toHaveBeenCalledWith(match.id);

        // A non-'match:end' event must not trigger unregistration.
        (tickLoop.unregister as jest.Mock).mockClear();
        cleanupListener!.modelChanged(new ModelEvent(match, 'state', {}));
        expect(tickLoop.unregister).not.toHaveBeenCalled();

        addListenerSpy.mockRestore();
      });
    });
  });

  describe('queue:cancel', () => {
    it('delegates to MatchmakingQueue.cancel with the requesting player id', () => {
      const queue = makeQueue();
      const controller = new MatchmakingController(
        queue,
        makeView(),
        { register: jest.fn() } as unknown as TickLoop,
        makeSockets(),
        jest.fn(),
      );
      controller.operation('queue:cancel', { player: new Player('p1', 'Alice', new Date()) });
      expect(queue.cancel).toHaveBeenCalledWith('p1');
    });

    it('propagates NotQueuedError uncaught', () => {
      const queue = makeQueue({
        cancel: jest.fn(() => {
          throw new NotQueuedError('p1');
        }),
      });
      const controller = new MatchmakingController(
        queue,
        makeView(),
        { register: jest.fn() } as unknown as TickLoop,
        makeSockets(),
        jest.fn(),
      );
      expect(() => controller.operation('queue:cancel', { player: new Player('p1', 'Alice', new Date()) })).toThrow(
        NotQueuedError,
      );
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest MatchmakingController
--coverage --collectCoverageFrom="src/controller/MatchmakingController.ts"` — validated result: **7 tests
passing, 100% statement/branch/function/line coverage**, including both CRITICAL CHECKPOINT tests (TickLoop
registration wiring and TickLoop cleanup-on-`match:end` wiring). Also re-run `npx jest MatchmakingQueue
--coverage --collectCoverageFrom="src/model/MatchmakingQueue.ts"` after step 0's correction — still **100%
coverage**, all pre-existing tests green with their updated assertions. This was validated (both typecheck
and the full test run) **specifically against a repo where `MatchmakingBroadcastView.ts`/
`MatchBroadcastView.ts` are still their original `NotImplementedError` stubs** — the intended execution
order, since `10_server_7` isn't a prerequisite of this prompt. If you happen to be running this after
`10_server_7` is already done, it still passes identically. Branch `server` from `main` (or reuse an
already-checked-out `server` branch), commit `Step 10: MatchmakingController implementation and tests,
MatchmakingQueue playerId-routing correction`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this is the one place a new `MatchModel` gets constructed and registered with `TickLoop` — its
test coverage of that wiring (both registration AND the `match:end`-triggered unregistration) is load-
bearing for the rest of this batch, since nothing else exercises it.** Do not skip the two CRITICAL
CHECKPOINT tests above when transcribing this prompt.
