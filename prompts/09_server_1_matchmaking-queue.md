# Prompt 09_server_1 — MatchmakingQueue Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
The code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL: this is one of the six pre-identified checkpoint classes
Master context §8 flags "Matchmaking pairing race" as an anticipated critical checkpoint: two simultaneous
`queue:join` calls both matching the same third player. The mitigation is that the pairing method itself
must be tested for double-pairing *before any socket code exists* — this prompt is that test, and it must
pass before `MatchmakingController` (Step 10) is written. Implementation plan §2 lists this exact scenario
as one of the six named checkpoint tests every batch must include; it's test #1 in that list below §3.
Don't treat it as an ordinary unit test — it validates the one property this whole class exists to
guarantee.

**Scope note:** `size()` is already implemented on the current stub — leave it untouched.

---

### 1. Replace `packages/server/src/model/MatchmakingQueue.ts` with:

```ts
import {
  AbstractModel,
  Player,
  PlayerId,
  ModelEvent,
  AlreadyQueuedError,
  NotQueuedError,
} from '@arena/shared';
import { QueueEntry } from './QueueEntry';

/**
 * The FIFO pool of identified players waiting to be paired into a match (R2.1–R2.6). One process-wide
 * instance, observed by `MatchmakingBroadcastView` via `AbstractModel`'s `ModelListener` mechanism.
 */
export class MatchmakingQueue extends AbstractModel {
  private entries: QueueEntry[] = [];
  private activeMatchCount = 0;

  constructor(
    /** Upper bound on matches running concurrently (R-P3); pairing is withheld once reached. */
    private readonly maxConcurrentMatches: number,
  ) {
    super();
  }

  /**
   * Adds a player to the back of the queue.
   * @param player - the identified player joining the queue
   * @returns the player's 1-based position in the queue
   * @throws {AlreadyQueuedError} if the player is already queued or already in an active match (R2.2)
   */
  join(player: Player): number {
    if (this.entries.some((e) => e.playerId === player.id)) {
      throw new AlreadyQueuedError(player.id);
    }
    this.entries.push(new QueueEntry(player.id, player.username, Date.now()));
    const position = this.entries.length;
    this.notifyChanged(new ModelEvent(this, 'queue:joined', { position }));
    return position;
  }

  /**
   * Removes a player from the queue before they've been paired.
   * @param playerId - the player to remove
   * @throws {NotQueuedError} if playerId is not currently queued (R2.3)
   */
  cancel(playerId: PlayerId): void {
    const index = this.entries.findIndex((e) => e.playerId === playerId);
    if (index === -1) {
      throw new NotQueuedError(playerId);
    }
    this.entries.splice(index, 1);
    this.notifyChanged(new ModelEvent(this, 'queue:cancelled', {}));
  }

  /**
   * Attempts to pair the two longest-waiting entries, if a match slot is free under
   * `maxConcurrentMatches` (R2.4, R2.5). Does not itself construct a `MatchModel` — the caller
   * (`MatchmakingController`) does that with the returned pair.
   *
   * Deliberately does not notifyChanged() on a successful pairing: `match:found`'s payload
   * (`matchId`, per-player `team`/`opponentUsername`, `roster`) doesn't exist until the caller builds the
   * actual `MatchModel`, and it differs per player — unlike every other event this class emits, it can't be
   * a single broadcast to all listeners. Broadcasting it is `MatchmakingController`/`MatchmakingBroadcastView`'s
   * job once the match is constructed, not this method's.
   * @returns the two paired entries, removed from the queue, or null if no pairing is currently possible
   */
  tryPairNext(): [QueueEntry, QueueEntry] | null {
    if (this.entries.length < 2) return null;
    if (this.activeMatchCount >= this.maxConcurrentMatches) return null;
    const [first, second] = this.entries.splice(0, 2);
    this.activeMatchCount += 1;
    return [first, second];
  }

  /** @returns the number of players currently waiting in the queue. */
  size(): number {
    return this.entries.length;
  }
}
```

### CRITICAL: a known gap, flagged rather than silently worked around
`activeMatchCount` only ever increments in this class — nothing in the current class list (`docs/
01_class_list.md` §5a) gives `MatchmakingQueue` a way to release a slot when a match ends. That release
mechanism is out of scope for this prompt (it lives with whatever wires match-end back to the queue, most
likely `MatchmakingController` or `TickLoop`, both Step 10 work) — do not invent a `releaseMatchSlot()`
method here to paper over it. Flag this explicitly to whoever writes the `MatchmakingController` prompt
(`10_server_2`): the bound will only ever tighten, never loosen, until that gap is closed.

### 2. Create `packages/server/src/model/MatchmakingQueue.test.ts` with:

```ts
import { Player, ModelListener, AlreadyQueuedError, NotQueuedError } from '@arena/shared';
import { MatchmakingQueue } from './MatchmakingQueue';

function makePlayer(id: string, username: string): Player {
  return new Player(id, username, new Date());
}

function collectEvents(queue: MatchmakingQueue): { type: string; payload: unknown }[] {
  const events: { type: string; payload: unknown }[] = [];
  const listener: ModelListener = { modelChanged: (e) => events.push({ type: e.type, payload: e.payload }) };
  queue.addModelListener(listener);
  return events;
}

describe('MatchmakingQueue', () => {
  describe('join', () => {
    it('adds the player and returns their 1-based queue position', () => {
      const queue = new MatchmakingQueue(50);
      expect(queue.join(makePlayer('p1', 'Alice'))).toBe(1);
      expect(queue.join(makePlayer('p2', 'Bob'))).toBe(2);
      expect(queue.size()).toBe(2);
    });

    it('broadcasts queue:joined with the new position', () => {
      const queue = new MatchmakingQueue(50);
      const events = collectEvents(queue);
      queue.join(makePlayer('p1', 'Alice'));
      expect(events).toEqual([{ type: 'queue:joined', payload: { position: 1 } }]);
    });

    it('throws AlreadyQueuedError if the player is already queued', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      expect(() => queue.join(makePlayer('p1', 'Alice'))).toThrow(AlreadyQueuedError);
      expect(queue.size()).toBe(1);
    });
  });

  describe('cancel', () => {
    it('removes a queued player', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      queue.cancel('p1');
      expect(queue.size()).toBe(1);
    });

    it('broadcasts queue:cancelled', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      const events = collectEvents(queue);
      queue.cancel('p1');
      expect(events).toEqual([{ type: 'queue:cancelled', payload: {} }]);
    });

    it('throws NotQueuedError if the player is not queued', () => {
      const queue = new MatchmakingQueue(50);
      expect(() => queue.cancel('nobody')).toThrow(NotQueuedError);
    });

    it('throws NotQueuedError on a second cancel of the same player (no phantom re-add)', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.cancel('p1');
      expect(() => queue.cancel('p1')).toThrow(NotQueuedError);
    });
  });

  describe('tryPairNext', () => {
    it('returns null when fewer than two players are queued', () => {
      const queue = new MatchmakingQueue(50);
      expect(queue.tryPairNext()).toBeNull();
      queue.join(makePlayer('p1', 'Alice'));
      expect(queue.tryPairNext()).toBeNull();
    });

    it('pairs the two longest-waiting entries in FIFO order and removes them from the queue', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      queue.join(makePlayer('p3', 'Carol'));
      const pair = queue.tryPairNext();
      expect(pair).not.toBeNull();
      expect(pair!.map((e) => e.playerId)).toEqual(['p1', 'p2']);
      expect(queue.size()).toBe(1);
    });

    it('CRITICAL CHECKPOINT: does not double-pair the same player when called back-to-back', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      queue.join(makePlayer('p3', 'Carol'));
      queue.join(makePlayer('p4', 'Dan'));

      const first = queue.tryPairNext();
      const second = queue.tryPairNext();
      const third = queue.tryPairNext();

      expect(first!.map((e) => e.playerId)).toEqual(['p1', 'p2']);
      expect(second!.map((e) => e.playerId)).toEqual(['p3', 'p4']);
      expect(third).toBeNull();

      const allPairedIds = [...first!, ...second!].map((e) => e.playerId);
      expect(new Set(allPairedIds).size).toBe(4); // no id appears in both pairs
      expect(queue.size()).toBe(0);
    });

    it('CRITICAL CHECKPOINT (R2.5): stops pairing once maxConcurrentMatches is reached, leaving the rest queued in order', () => {
      const queue = new MatchmakingQueue(1);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      queue.join(makePlayer('p3', 'Carol'));
      queue.join(makePlayer('p4', 'Dan'));

      const first = queue.tryPairNext();
      expect(first!.map((e) => e.playerId)).toEqual(['p1', 'p2']);

      // Bound (1) is now reached -- further pairing attempts must return null, not touch the remaining queue.
      expect(queue.tryPairNext()).toBeNull();
      expect(queue.tryPairNext()).toBeNull();
      expect(queue.size()).toBe(2);

      // The two still-queued players remain, in their original join order -- p3 first, then p4.
      queue.cancel('p3');
      expect(queue.size()).toBe(1);
      expect(() => queue.cancel('p3')).toThrow(NotQueuedError); // p3 is gone, not silently retained
      queue.cancel('p4'); // p4 is still there, undisturbed by the blocked pairing attempts
      expect(queue.size()).toBe(0);
    });

    it('does not emit a model event on a successful pairing (match:found is broadcast by the caller once a real MatchModel exists)', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      const events = collectEvents(queue);
      queue.tryPairNext();
      expect(events).toEqual([]);
    });
  });

  describe('size', () => {
    it('reflects joins, cancels, and pairings', () => {
      const queue = new MatchmakingQueue(50);
      expect(queue.size()).toBe(0);
      queue.join(makePlayer('p1', 'Alice'));
      expect(queue.size()).toBe(1);
      queue.join(makePlayer('p2', 'Bob'));
      queue.tryPairNext();
      expect(queue.size()).toBe(0);
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest MatchmakingQueue
--coverage --collectCoverageFrom="src/model/MatchmakingQueue.ts"` — validated result: **13 tests passing,
100% statement/branch/function/line coverage**, including both named checkpoint tests (double-pairing,
`maxConcurrentMatches` bound). `docs/01_class_list.md` §5a's `MatchmakingQueue` row already matches this
implementation exactly (constructor, `join`/`cancel`/`tryPairNext`/`size` signatures) — no doc update
needed.

**MANDATORY prerequisite check**: `npm run typecheck --workspaces` must show no config errors before you
start — if `packages/*/jest.config.js` don't exist yet, stop; a prior infra fix hasn't landed, and tests
won't run correctly without it (ts-jest must be wired up, or Jest silently falls back to a plain Babel
transform that cannot parse TypeScript at all).

Branch `server` from `main` (`git branch -D server 2>/dev/null; git checkout -b server main`), commit `Step
9: MatchmakingQueue implementation and tests`, push, open a PR into `main`. This does not need to merge
immediately the way `09_shared_1` does — batch it with the rest of the `server` track's Step 9 work per
master context §9.4 (merge at the end of the step, not after every prompt).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this class's pairing behavior is now locked in — `MatchmakingController` (`10_server_2`) must
call `tryPairNext()` exactly as specified above (no event is emitted on pairing; the controller is
responsible for broadcasting `match:found` itself once it builds the real `MatchModel`) and must account for
the `activeMatchCount`-never-releases gap flagged in §1 before that prompt can be considered complete.**
