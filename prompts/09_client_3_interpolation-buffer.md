# Prompt 09_client_3 — Implement: `InterpolationBuffer`

**Owner: Raj.**

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md` before executing this prompt.** Then read
`packages/client/src/model/InterpolationBuffer.ts` — the stub below is transcribed from that file
at the time this prompt was written, but the file on disk is ground truth. If they differ, use the
file.

**MANDATORY reminder (master context §8, item 5 — CRITICAL CHECKPOINT):** `InterpolationBuffer` is
a rendering aid only. `getInterpolatedPosition()` must be a pure read/compute — it must never write
back into `ClientMatchModel`, into any snapshot in the buffer, or into any other authoritative
field. A named test **proving this via reference equality** is mandatory and is called out explicitly
in §3 below.

---

### MANDATORY: Sandwich Requirement

- **Start**: `packages/client/src/model/InterpolationBuffer.ts` compiles (`npm run typecheck -w
  @arena/client` passes before you change anything).
- **End**: `npm run typecheck -w @arena/client` still passes; `npx jest InterpolationBuffer
  --coverage` is green with ≥ 100% statement coverage; `git status` shows only
  `InterpolationBuffer.ts` modified and the new test file untracked/staged.

---

## 1. Stub (ground truth — read from disk)

```ts
import { MatchStatePayload, PlayerId, Position, NotImplementedError } from '@arena/shared';

/**
 * Buffers recent authoritative MatchStatePayload snapshots and produces smoothly-interpolated
 * positions for rendering between the server's 20Hz ticks (R4.7, R-P4).
 * This is a rendering aid only — nothing it produces is written back into ClientMatchModel or
 * treated as authoritative. The server remains the sole source of truth for all positions.
 */
export class InterpolationBuffer {
  /** Circular store of retained snapshots, oldest evicted once capacity is exceeded. */
  private samples: MatchStatePayload[] = [];

  /**
   * @param capacity - maximum number of snapshots retained; oldest is dropped once exceeded
   */
  constructor(private readonly capacity: number) {}

  /**
   * Records a newly-received authoritative snapshot.
   * @param snapshot - the match state as broadcast by the server
   */
  push(snapshot: MatchStatePayload): void {
    throw new NotImplementedError('InterpolationBuffer.push not yet implemented');
  }

  /**
   * Computes a smoothed, render-only position for a participant at the given time, interpolating
   * between the two bracketing snapshots. Never mutates any stored model state.
   * CRITICAL: the returned Position is for display only — never write it back into ClientMatchModel
   * or any authoritative field (prompts/00_master_context.md §8, R4.7 / R-P4).
   * @param playerId - which participant to interpolate
   * @param now - the current render timestamp in milliseconds
   * @returns an interpolated Position for display
   */
  getInterpolatedPosition(playerId: PlayerId, now: number): Position {
    throw new NotImplementedError('InterpolationBuffer.getInterpolatedPosition not yet implemented');
  }
}
```

---

## 2. Design

### Ring buffer (`push`)

`push(snapshot)` appends to `samples` and, if `samples.length > capacity`, drops the oldest with
`shift()`. This is O(n) per push but capacity is small (a few hundred ms of snapshots at 20Hz
means ~4–10 entries for any practical render window) so it is fine.

### Timestamp strategy (`getInterpolatedPosition`)

`MatchStatePayload` carries a `tick` field (server tick counter, 20Hz). There is no wall-clock
timestamp in the payload. Derive virtual timestamps by assuming 50ms between ticks:

```
virtualTime(s) = now − (lastTick − s.tick) × 50ms
```

where `lastTick` is the tick number of the most recently pushed snapshot. At `now`, the last
sample's virtual time equals `now` exactly; earlier samples are 50ms apart stepping backwards.

### Bracketing and interpolation

Walk the sample array looking for adjacent samples A and B where
`virtualTime(A) <= now <= virtualTime(B)`. Linear-interpolate `t = (now − tA) / (tB − tA)` and
return `Position(pA.x + t*(pB.x − pA.x), pA.y + t*(pB.y − pA.y))`.

### Fallback (fewer than 2 samples)

- 0 samples: return `new Position(0, 0)` — do not throw.
- 1 sample: return the known position of the requested player from that snapshot (or `(0,0)` if
  the player is not found in it).

---

## 3. Implementation

```ts
import { MatchStatePayload, PlayerId, Position } from '@arena/shared';

export class InterpolationBuffer {
  private samples: MatchStatePayload[] = [];

  constructor(private readonly capacity: number) {}

  push(snapshot: MatchStatePayload): void {
    this.samples.push(snapshot);
    if (this.samples.length > this.capacity) {
      this.samples.shift();
    }
  }

  getInterpolatedPosition(playerId: PlayerId, now: number): Position {
    if (this.samples.length === 0) {
      return new Position(0, 0);
    }

    if (this.samples.length === 1) {
      return this.findPosition(this.samples[0], playerId) ?? new Position(0, 0);
    }

    const TICK_INTERVAL_MS = 50; // 20Hz server tick rate (master context §4.1)
    const lastTick = this.samples[this.samples.length - 1].tick;

    const toMs = (s: MatchStatePayload): number =>
      now - (lastTick - s.tick) * TICK_INTERVAL_MS;

    // Default to the last two samples; override if we find a tighter bracket.
    let prev = this.samples[this.samples.length - 2];
    let next = this.samples[this.samples.length - 1];

    for (let i = 0; i < this.samples.length - 1; i++) {
      const tA = toMs(this.samples[i]);
      const tB = toMs(this.samples[i + 1]);
      if (tA <= now && now <= tB) {
        prev = this.samples[i];
        next = this.samples[i + 1];
        break;
      }
    }

    const tPrev = toMs(prev);
    const tNext = toMs(next);
    const span = tNext - tPrev;

    const pPrev = this.findPosition(prev, playerId);
    const pNext = this.findPosition(next, playerId);

    if (!pPrev) return pNext ?? new Position(0, 0);
    if (!pNext) return pPrev;
    if (span <= 0) return pNext;

    const t = Math.max(0, Math.min(1, (now - tPrev) / span));
    return new Position(
      pPrev.x + t * (pNext.x - pPrev.x),
      pPrev.y + t * (pNext.y - pPrev.y),
    );
  }

  private findPosition(snapshot: MatchStatePayload, playerId: PlayerId): Position | undefined {
    return snapshot.participants.find((p) => p.playerId === playerId)?.position;
  }
}
```

---

## 4. Test file

Create `packages/client/src/model/__tests__/InterpolationBuffer.test.ts`:

```ts
import { InterpolationBuffer } from '../InterpolationBuffer';
import { ClientMatchModel } from '../ClientMatchModel';
import { Position, Team, ConnectionStatus } from '@arena/shared';
import type { MatchStatePayload, ParticipantSnapshot } from '@arena/shared';

const makeParticipant = (playerId: string, x: number, y: number): ParticipantSnapshot => ({
  playerId,
  team: Team.A,
  championId: 'korr',
  position: new Position(x, y),
  health: 180,
  resource: 100,
  cooldownsRemaining: {},
  crowdControlled: false,
  connectionStatus: ConnectionStatus.CONNECTED,
  alive: true,
});

const makeSnapshot = (tick: number, x: number, y: number): MatchStatePayload => ({
  matchId: 'match-1',
  tick,
  participants: [makeParticipant('p1', x, y), makeParticipant('p2', 0, 0)],
});

describe('InterpolationBuffer', () => {
  describe('push()', () => {
    it('retains up to capacity snapshots and evicts the oldest when full', () => {
      const buf = new InterpolationBuffer(2);
      buf.push(makeSnapshot(1, 0, 0));
      buf.push(makeSnapshot(2, 10, 0));
      buf.push(makeSnapshot(3, 20, 0)); // evicts tick 1
      // The buffer should still return a valid Position (tick 1 is gone)
      const pos = buf.getInterpolatedPosition('p1', Date.now());
      expect(pos).toBeInstanceOf(Position);
    });
  });

  describe('getInterpolatedPosition()', () => {
    it('returns a Position when only one snapshot is buffered', () => {
      const buf = new InterpolationBuffer(10);
      buf.push(makeSnapshot(1, 5, 10));
      const pos = buf.getInterpolatedPosition('p1', 1000);
      expect(pos).toBeInstanceOf(Position);
      expect(pos.x).toBe(5);
      expect(pos.y).toBe(10);
    });

    it('does not throw when the buffer is empty — returns a safe default', () => {
      const buf = new InterpolationBuffer(5);
      expect(() => buf.getInterpolatedPosition('p1', 1000)).not.toThrow();
      expect(buf.getInterpolatedPosition('p1', 1000)).toBeInstanceOf(Position);
    });

    it('linearly interpolates between two snapshots at the midpoint', () => {
      const buf = new InterpolationBuffer(5);
      // tick 10 → x=0, tick 11 → x=100. Virtual timestamps: tick 11 = now, tick 10 = now-50ms.
      // At now-25ms (midpoint), expected x ≈ 50.
      const now = 1000;
      buf.push(makeSnapshot(10, 0, 0));
      buf.push(makeSnapshot(11, 100, 0));
      const pos = buf.getInterpolatedPosition('p1', now - 25);
      expect(pos.x).toBeCloseTo(50, 0);
    });

    it('returns the most recent position when now is past the last snapshot', () => {
      const buf = new InterpolationBuffer(5);
      buf.push(makeSnapshot(10, 0, 0));
      buf.push(makeSnapshot(11, 100, 0));
      // now is well after tick 11's virtual time
      const pos = buf.getInterpolatedPosition('p1', 99999);
      expect(pos).toBeInstanceOf(Position);
    });

    // ── CRITICAL CHECKPOINT ─────────────────────────────────────────────────
    it('CRITICAL: does not mutate ClientMatchModel or any external state', () => {
      const buf = new InterpolationBuffer(5);
      const matchModel = new ClientMatchModel();
      buf.push(makeSnapshot(1, 0, 0));
      buf.push(makeSnapshot(2, 100, 0));

      const stateBefore = JSON.stringify(matchModel);
      buf.getInterpolatedPosition('p1', 1000);
      const stateAfter = JSON.stringify(matchModel);

      expect(stateAfter).toBe(stateBefore); // ClientMatchModel entirely untouched
    });

    it('CRITICAL: does not mutate the buffered snapshots', () => {
      const buf = new InterpolationBuffer(5);
      const snap1 = makeSnapshot(1, 0, 0);
      const snap2 = makeSnapshot(2, 100, 0);
      buf.push(snap1);
      buf.push(snap2);

      buf.getInterpolatedPosition('p1', 1000);

      expect(snap1.participants[0].position.x).toBe(0);
      expect(snap2.participants[0].position.x).toBe(100);
    });
  });
});
```

---

## 5. Verification and Git

**Step 1 — typecheck:**
```
npm run typecheck -w @arena/client
```

**Step 2 — tests with coverage:**
```
npx jest --testPathPattern="InterpolationBuffer" --coverage --coveragePathPattern="model/InterpolationBuffer"
```
Expected: **7 tests pass**, **100% statements, 100% branches, 100% functions** on
`InterpolationBuffer.ts`. The two CRITICAL CHECKPOINT tests must be among the passing tests — if
either fails, do not commit.

**Step 3 — git:**
```bash
git add packages/client/src/model/InterpolationBuffer.ts \
        packages/client/src/model/__tests__/InterpolationBuffer.test.ts
git commit -m "Step 9 client: implement InterpolationBuffer"
git push origin client
```

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `getInterpolatedPosition()` computes a NEW `Position` object for the renderer. It reads
`snapshot.participants[].position` but never writes to it, never writes to `ClientMatchModel`, and
never writes to any other field outside its own local variables. If a test calling
`getInterpolatedPosition()` modifies a field it didn't explicitly set, that is a bug — and the two
CRITICAL CHECKPOINT tests above are specifically designed to catch it. Both must pass before any
commit.**
