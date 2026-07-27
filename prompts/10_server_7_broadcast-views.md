# Prompt 10_server_7 — Broadcast View Package Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_server_2` (MatchmakingController) must be merged first — this prompt's `MatchmakingBroadcastView`
targets the exact `{playerId, ...}`-wrapped event shapes that controller emits for `match:found` (and the
corrected `queue:joined`/`queue:cancelled` payloads from `MatchmakingQueue`), and `10_server_3`
(ChampionSelectController) must be merged first for `MatchBroadcastView`'s `error` handling — same reason.

---

### Design notes

**Per-player routing.** Two of the six/seven event types each view handles are not symmetric across both
players: `queue:joined`/`queue:cancelled`/`match:found` (`MatchmakingBroadcastView`) and `error`
(`MatchBroadcastView`) all belong to exactly one player, not both. Each carries a `playerId` in its internal
`ModelEvent.payload` (see `10_server_2`'s and `10_server_3`'s corrections) that these views strip back out
before emitting — the actual wire payload sent to the socket always matches the documented contract type
exactly (`QueueJoinedPayload`, `QueueCancelledPayload`, `MatchFoundPayload`, `ErrorPayload`), never leaking
the internal routing field.

**Broadcast-to-both events.** `champion:selected`, `match:start`, `match:state`, `match:end`,
`match:player_disconnected`, `match:player_reconnected` are all naturally symmetric (both participants need
to see them) — `MatchBroadcastView` just iterates every socket in the `sockets` map passed to its
constructor, which is scoped to exactly this match's two participants (per the existing doc comment).

**Internal event-type-string translation.** `MatchModel` emits three event types whose internal name
differs from the wire event name: `'state'` → `match:state`, `'player_disconnected'` → `match:player_
disconnected`, `'player_reconnected'` → `match:player_reconnected`. Translating between the two is exactly
this view's job — `MatchModel` itself doesn't know or care what the wire event names are.

---

### 1. Replace `packages/server/src/view/MatchmakingBroadcastView.ts` with:

```ts
import {
  View,
  ModelListener,
  ModelEvent,
  PlayerId,
  NotImplementedError,
  QueueJoinedPayload,
  QueueCancelledPayload,
  MatchFoundPayload,
  SOCKET_EVENTS,
} from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchmakingQueue } from '../model/MatchmakingQueue';

/** A `match:found` broadcast, addressed to one specific player — see `MatchmakingController` (10_server_2). */
export type MatchFoundBroadcast = MatchFoundPayload & { playerId: PlayerId };

/**
 * Socket.IO broadcaster for MatchmakingQueue changes — the server's concrete View realization for
 * matchmaking, since Arena has no desktop GUI (no JFrameView equivalent, see docs/01_class_list.md §1).
 * A pure observer with no paired controller: it never receives player input, only pushes queue state out.
 */
export class MatchmakingBroadcastView implements View, ModelListener {
  constructor(
    private model: MatchmakingQueue,
    /** Every currently-connected player's socket, keyed by playerId, for targeted emission. */
    private sockets: Map<PlayerId, Socket>,
  ) {
    this.model.addModelListener(this);
  }

  getModel(): MatchmakingQueue {
    return this.model;
  }

  setModel(model: MatchmakingQueue): void {
    this.model = model;
  }

  /**
   * Not applicable — a pure broadcaster has no paired controller to return (docs/01_class_list.md §5c
   * note). Stubbed to throw rather than implemented; do not treat this as an ArenaError-style domain
   * exception, it signals a programming error if ever called.
   */
  getController(): never {
    throw new NotImplementedError('MatchmakingBroadcastView.getController is not applicable');
  }

  /** Not applicable, for the same reason as getController() above. */
  setController(): void {
    throw new NotImplementedError('MatchmakingBroadcastView.setController is not applicable');
  }

  /**
   * Reacts to a MatchmakingQueue change by emitting the corresponding Socket.IO event to the affected
   * player(s): `queue:joined`, `queue:cancelled`, or `match:found`, depending on event.type.
   *
   * CORRECTION (Step 10): `MatchmakingQueue.join`/`cancel`'s internal ModelEvent payload now includes
   * `playerId` (previously just `{position}` / `{}`) — without it, this view had no way to know which
   * single socket a `queue:joined`/`queue:cancelled` broadcast belongs to. `playerId` is stripped back out
   * before emitting, since it is not part of the wire-contract `QueueJoinedPayload`/`QueueCancelledPayload`
   * shapes the client actually receives. `match:found` is never auto-triggered by the model (see
   * `MatchmakingQueue.tryPairNext`'s own doc comment) — `MatchmakingController` calls this method directly,
   * once per paired player, once a real `MatchModel` exists (10_server_2).
   * @param event - the model-pushed change to broadcast
   */
  modelChanged(event: ModelEvent): void {
    switch (event.type) {
      case 'queue:joined': {
        const { playerId, position } = event.payload as { playerId: PlayerId; position: number };
        const payload: QueueJoinedPayload = { position };
        this.sockets.get(playerId)?.emit(SOCKET_EVENTS.QUEUE_JOINED, payload);
        break;
      }
      case 'queue:cancelled': {
        const { playerId } = event.payload as { playerId: PlayerId };
        const payload: QueueCancelledPayload = {};
        this.sockets.get(playerId)?.emit(SOCKET_EVENTS.QUEUE_CANCELLED, payload);
        break;
      }
      case 'match:found': {
        const { playerId, ...payload } = event.payload as MatchFoundBroadcast;
        this.sockets.get(playerId)?.emit(SOCKET_EVENTS.MATCH_FOUND, payload as MatchFoundPayload);
        break;
      }
    }
  }
}
```

### 2. Replace `packages/server/src/view/MatchBroadcastView.ts` with:

```ts
import {
  View,
  ModelListener,
  ModelEvent,
  PlayerId,
  NotImplementedError,
  ChampionSelectedPayload,
  MatchStartPayload,
  MatchStatePayload,
  MatchEndPayload,
  PlayerDisconnectedPayload,
  PlayerReconnectedPayload,
  ErrorPayload,
  SOCKET_EVENTS,
} from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchModel } from '../model/MatchModel';

/**
 * Socket.IO broadcaster for one MatchModel's changes — the server's concrete View realization for combat
 * (no JFrameView equivalent, see docs/01_class_list.md §1). A pure observer with no paired controller: it
 * never receives player input, only pushes match state out at up to 20Hz (R-P2).
 */
export class MatchBroadcastView implements View, ModelListener {
  constructor(
    private model: MatchModel,
    /** This match's two participants' sockets, keyed by playerId, for targeted and paired emission. */
    private sockets: Map<PlayerId, Socket>,
  ) {
    this.model.addModelListener(this);
  }

  getModel(): MatchModel {
    return this.model;
  }

  setModel(model: MatchModel): void {
    this.model = model;
  }

  /**
   * Not applicable — a pure broadcaster has no paired controller to return (docs/01_class_list.md §5c
   * note). Stubbed to throw rather than implemented; do not treat this as an ArenaError-style domain
   * exception, it signals a programming error if ever called.
   */
  getController(): never {
    throw new NotImplementedError('MatchBroadcastView.getController is not applicable');
  }

  /** Not applicable, for the same reason as getController() above. */
  setController(): void {
    throw new NotImplementedError('MatchBroadcastView.setController is not applicable');
  }

  private broadcast(eventName: string, payload: unknown): void {
    for (const socket of this.sockets.values()) {
      socket.emit(eventName, payload);
    }
  }

  /**
   * Reacts to a MatchModel change by emitting the corresponding Socket.IO event: `champion:selected`,
   * `match:start`, `match:state`, `match:end`, `match:player_disconnected`, or `match:player_reconnected`
   * are broadcast to both of this match's sockets (this.sockets is scoped to exactly this match's two
   * participants, per constructor). `error` (CORRECTION, Step 10 — added by `ChampionSelectController` to
   * carry a per-player validation failure, docs/01_class_list.md §5b) is targeted at just the one player
   * named in its payload, since it is not participant-symmetric like the others.
   * MatchModel's own internal event type strings ('state', 'player_disconnected', 'player_reconnected')
   * differ from their wire event names — translating between the two is this method's job.
   * @param event - the model-pushed change to broadcast
   */
  modelChanged(event: ModelEvent): void {
    switch (event.type) {
      case 'champion:selected':
        this.broadcast(SOCKET_EVENTS.CHAMPION_SELECTED, event.payload as ChampionSelectedPayload);
        break;
      case 'match:start':
        this.broadcast(SOCKET_EVENTS.MATCH_START, event.payload as MatchStartPayload);
        break;
      case 'state':
        this.broadcast(SOCKET_EVENTS.MATCH_STATE, event.payload as MatchStatePayload);
        break;
      case 'match:end':
        this.broadcast(SOCKET_EVENTS.MATCH_END, event.payload as MatchEndPayload);
        break;
      case 'player_disconnected':
        this.broadcast(SOCKET_EVENTS.MATCH_PLAYER_DISCONNECTED, event.payload as PlayerDisconnectedPayload);
        break;
      case 'player_reconnected':
        this.broadcast(SOCKET_EVENTS.MATCH_PLAYER_RECONNECTED, event.payload as PlayerReconnectedPayload);
        break;
      case 'error': {
        const { playerId, ...rest } = event.payload as { playerId: PlayerId } & ErrorPayload;
        this.sockets.get(playerId)?.emit(SOCKET_EVENTS.ERROR, rest as ErrorPayload);
        break;
      }
    }
  }
}
```

### 3. Create `packages/server/src/view/MatchmakingBroadcastView.test.ts` with:

```ts
import { ModelEvent, ModelListener } from '@arena/shared';
import { MatchmakingBroadcastView } from './MatchmakingBroadcastView';
import type { MatchmakingQueue } from '../model/MatchmakingQueue';
import type { Socket } from 'socket.io';

function makeQueue(): MatchmakingQueue & { listener: ModelListener } {
  let listener: ModelListener;
  return {
    addModelListener: (l: ModelListener) => {
      listener = l;
    },
    get listener() {
      return listener;
    },
  } as unknown as MatchmakingQueue & { listener: ModelListener };
}

function makeSocket(): Socket & { emit: jest.Mock } {
  return { emit: jest.fn() } as unknown as Socket & { emit: jest.Mock };
}

describe('MatchmakingBroadcastView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the model', () => {
      const queue = makeQueue();
      const view = new MatchmakingBroadcastView(queue, new Map());
      expect(queue.listener).toBe(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the underlying model', () => {
      const queue = makeQueue();
      const view = new MatchmakingBroadcastView(queue, new Map());
      expect(view.getModel()).toBe(queue);
      const other = makeQueue();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it("emits queue:joined with just {position} to the joining player's socket only", () => {
      const queue = makeQueue();
      const p1Socket = makeSocket();
      const p2Socket = makeSocket();
      const sockets = new Map([
        ['p1', p1Socket],
        ['p2', p2Socket],
      ]);
      const view = new MatchmakingBroadcastView(queue, sockets);
      view.modelChanged(new ModelEvent(queue, 'queue:joined', { playerId: 'p1', position: 3 }));
      expect(p1Socket.emit).toHaveBeenCalledWith('queue:joined', { position: 3 });
      expect(p2Socket.emit).not.toHaveBeenCalled();
    });

    it('emits queue:cancelled with no fields to the cancelling player only', () => {
      const queue = makeQueue();
      const p1Socket = makeSocket();
      const sockets = new Map([['p1', p1Socket]]);
      const view = new MatchmakingBroadcastView(queue, sockets);
      view.modelChanged(new ModelEvent(queue, 'queue:cancelled', { playerId: 'p1' }));
      expect(p1Socket.emit).toHaveBeenCalledWith('queue:cancelled', {});
    });

    it("emits match:found with the per-player payload, stripped of the routing playerId, to that player's socket only", () => {
      const queue = makeQueue();
      const p1Socket = makeSocket();
      const p2Socket = makeSocket();
      const sockets = new Map([
        ['p1', p1Socket],
        ['p2', p2Socket],
      ]);
      const view = new MatchmakingBroadcastView(queue, sockets);
      view.modelChanged(
        new ModelEvent(queue, 'match:found', {
          playerId: 'p1',
          matchId: 'm1',
          team: 'A',
          opponentUsername: 'Bob',
          roster: [],
        }),
      );
      expect(p1Socket.emit).toHaveBeenCalledWith('match:found', {
        matchId: 'm1',
        team: 'A',
        opponentUsername: 'Bob',
        roster: [],
      });
      expect(p2Socket.emit).not.toHaveBeenCalled();
    });

    it('does nothing for an unrecognized event type', () => {
      const queue = makeQueue();
      const socket = makeSocket();
      const view = new MatchmakingBroadcastView(queue, new Map([['p1', socket]]));
      expect(() => view.modelChanged(new ModelEvent(queue, 'unknown', {}))).not.toThrow();
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('is a no-op (does not throw) when the target player has no registered socket', () => {
      const queue = makeQueue();
      const view = new MatchmakingBroadcastView(queue, new Map());
      expect(() =>
        view.modelChanged(new ModelEvent(queue, 'queue:joined', { playerId: 'ghost', position: 1 })),
      ).not.toThrow();
    });
  });

  describe('getController / setController', () => {
    it('are not applicable and throw NotImplementedError', () => {
      const view = new MatchmakingBroadcastView(makeQueue(), new Map());
      expect(() => view.getController()).toThrow();
      expect(() => view.setController()).toThrow();
    });
  });
});
```

### 4. Create `packages/server/src/view/MatchBroadcastView.test.ts` with:

```ts
import { ModelEvent, ModelListener } from '@arena/shared';
import { MatchBroadcastView } from './MatchBroadcastView';
import type { MatchModel } from '../model/MatchModel';
import type { Socket } from 'socket.io';

function makeMatch(): MatchModel & { listener: ModelListener } {
  let listener: ModelListener;
  return {
    id: 'm1',
    addModelListener: (l: ModelListener) => {
      listener = l;
    },
    get listener() {
      return listener;
    },
  } as unknown as MatchModel & { listener: ModelListener };
}

function makeSocket(): Socket & { emit: jest.Mock } {
  return { emit: jest.fn() } as unknown as Socket & { emit: jest.Mock };
}

function twoSockets() {
  const p1 = makeSocket();
  const p2 = makeSocket();
  const sockets = new Map([
    ['p1', p1],
    ['p2', p2],
  ]);
  return { p1, p2, sockets };
}

describe('MatchBroadcastView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the model', () => {
      const match = makeMatch();
      const view = new MatchBroadcastView(match, new Map());
      expect(match.listener).toBe(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the underlying model', () => {
      const match = makeMatch();
      const view = new MatchBroadcastView(match, new Map());
      expect(view.getModel()).toBe(match);
      const other = makeMatch();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it('broadcasts champion:selected to both participants', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: false };
      view.modelChanged(new ModelEvent(makeMatch(), 'champion:selected', payload));
      expect(p1.emit).toHaveBeenCalledWith('champion:selected', payload);
      expect(p2.emit).toHaveBeenCalledWith('champion:selected', payload);
    });

    it('broadcasts match:start to both participants', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { matchId: 'm1', initialState: { matchId: 'm1', tick: 0, participants: [] } };
      view.modelChanged(new ModelEvent(makeMatch(), 'match:start', payload));
      expect(p1.emit).toHaveBeenCalledWith('match:start', payload);
      expect(p2.emit).toHaveBeenCalledWith('match:start', payload);
    });

    it("translates the model's internal 'state' event type to the wire event match:state", () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const snapshot = { matchId: 'm1', tick: 5, participants: [] };
      view.modelChanged(new ModelEvent(makeMatch(), 'state', snapshot));
      expect(p1.emit).toHaveBeenCalledWith('match:state', snapshot);
      expect(p2.emit).toHaveBeenCalledWith('match:state', snapshot);
    });

    it('broadcasts match:end to both participants', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { matchId: 'm1', reason: 'ELIMINATION', winningTeam: 'A', durationMs: 1000 };
      view.modelChanged(new ModelEvent(makeMatch(), 'match:end', payload));
      expect(p1.emit).toHaveBeenCalledWith('match:end', payload);
      expect(p2.emit).toHaveBeenCalledWith('match:end', payload);
    });

    it("translates 'player_disconnected' to match:player_disconnected, broadcast to both", () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { playerId: 'p1', gracePeriodSeconds: 30 };
      view.modelChanged(new ModelEvent(makeMatch(), 'player_disconnected', payload));
      expect(p1.emit).toHaveBeenCalledWith('match:player_disconnected', payload);
      expect(p2.emit).toHaveBeenCalledWith('match:player_disconnected', payload);
    });

    it("translates 'player_reconnected' to match:player_reconnected, broadcast to both", () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      const payload = { playerId: 'p1' };
      view.modelChanged(new ModelEvent(makeMatch(), 'player_reconnected', payload));
      expect(p1.emit).toHaveBeenCalledWith('match:player_reconnected', payload);
      expect(p2.emit).toHaveBeenCalledWith('match:player_reconnected', payload);
    });

    it('emits error only to the named player, stripped of the routing playerId', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      view.modelChanged(
        new ModelEvent(makeMatch(), 'error', { playerId: 'p1', code: 'INVALID_CHAMPION_SELECTION', message: 'nope' }),
      );
      expect(p1.emit).toHaveBeenCalledWith('error', { code: 'INVALID_CHAMPION_SELECTION', message: 'nope' });
      expect(p2.emit).not.toHaveBeenCalled();
    });

    it('does nothing for an unrecognized event type', () => {
      const { p1, p2, sockets } = twoSockets();
      const view = new MatchBroadcastView(makeMatch(), sockets);
      expect(() => view.modelChanged(new ModelEvent(makeMatch(), 'unknown', {}))).not.toThrow();
      expect(p1.emit).not.toHaveBeenCalled();
      expect(p2.emit).not.toHaveBeenCalled();
    });
  });

  describe('getController / setController', () => {
    it('are not applicable and throw NotImplementedError', () => {
      const view = new MatchBroadcastView(makeMatch(), new Map());
      expect(() => view.getController()).toThrow();
      expect(() => view.setController()).toThrow();
    });
  });
});
```

---

### 5. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest
MatchmakingBroadcastView MatchBroadcastView --coverage --collectCoverageFrom="src/view/*.ts"` — validated
result: **19 tests passing (8 + 11), 100% statement/branch/function/line coverage on both files**. Branch
`server` from `main` (or reuse an already-checked-out `server` branch), commit `Step 10: broadcast view
package implementation and tests`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: never let the internal routing `playerId` field leak into an actual socket emission.** Every
per-player-targeted case (`queue:joined`, `queue:cancelled`, `match:found`, `error`) must destructure it out
before calling `.emit()` — the wire contract types (`QueueJoinedPayload`, `MatchFoundPayload`, `ErrorPayload`,
etc.) do not include it, and leaking it would silently diverge from `packages/shared/src/contract`.
