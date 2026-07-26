# Prompt 09_client_1 — Implement: `ClientIdentityModel` + `ClientQueueModel`

**Owner: Raj.**

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md` before executing this prompt.** Then read
`packages/client/src/model/ClientIdentityModel.ts` and `packages/client/src/model/ClientQueueModel.ts`
— the stubs below are transcribed from those files at the time this prompt was written, but the files
on disk are ground truth. If they differ, use the files.

**MANDATORY reminder (master context §1.1):** Neither class here may compute or override an
authoritative value. Both classes mirror and display what the server sends — they never decide an
outcome. Every test must include at least one assertion that "applying a state payload stores it
as-is, without altering any field."

---

### MANDATORY: Sandwich Requirement

- **Start**: both stubs compile (`npm run typecheck -w @arena/client` passes before you change
  anything — existing type errors elsewhere in the package are pre-existing and do not block this
  prompt).
- **End**: `npm run typecheck -w @arena/client` still passes (no regressions); `npx jest
  ClientIdentityModel ClientQueueModel --coverage` is green with ≥ 100% statement coverage on
  both files; `git status` shows only the two implementation files modified and the two new test
  files untracked/staged under `packages/client/src/model/__tests__/`.

---

## 1. Stubs (ground truth — read from disk)

### `packages/client/src/model/ClientIdentityModel.ts`

```ts
import { AbstractModel, PlayerId, NotImplementedError } from '@arena/shared';

/**
 * Holds the local player's chosen username and server-assigned PlayerId for the duration of the
 * browser session (R1.1–R1.4). The single source of identity state on the client.
 */
export class ClientIdentityModel extends AbstractModel {
  /** Server-assigned stable identifier; null until identify() completes successfully. */
  public playerId: PlayerId | null = null;

  /** Username submitted by the player; null until identify() completes successfully. */
  public username: string | null = null;

  /**
   * Submits the chosen username to the server and stores the returned PlayerId in sessionStorage
   * so the same identifier survives a page reload within the session (R1.2).
   * @param username - non-empty string, at most 24 characters (R1.1); the server re-validates
   */
  identify(username: string): void {
    throw new NotImplementedError('ClientIdentityModel.identify not yet implemented');
  }

  /**
   * Returns the current PlayerId.
   * @returns the server-assigned PlayerId
   * @throws {PlayerNotFoundError} if called before a successful identify() (playerId is still null)
   */
  getPlayerId(): PlayerId {
    throw new NotImplementedError('ClientIdentityModel.getPlayerId not yet implemented');
  }
}
```

### `packages/client/src/model/ClientQueueModel.ts`

```ts
import { AbstractModel, MatchFoundPayload, NotImplementedError } from '@arena/shared';

/** Lifecycle state of the local player's position in the matchmaking queue (R2.1–R2.6). */
export type QueueStatus = 'idle' | 'queued' | 'matched';

/**
 * Tracks the local player's matchmaking queue state as reported by the server.
 * The server is authoritative — this model only stores what it has been told.
 */
export class ClientQueueModel extends AbstractModel {
  /** Current queue lifecycle state; starts idle and transitions on server events. */
  public status: QueueStatus = 'idle';

  /** 1-based position in the queue as last reported by the server; null when not queued. */
  public position: number | null = null;

  /**
   * Records that the player has entered the queue at the given position (R2.3).
   * @param position - 1-based queue position as reported by the server
   */
  setQueued(position: number): void {
    throw new NotImplementedError('ClientQueueModel.setQueued not yet implemented');
  }

  /**
   * Records that the player has left the queue (cancelled or timed out) (R2.5).
   */
  setCancelled(): void {
    throw new NotImplementedError('ClientQueueModel.setCancelled not yet implemented');
  }

  /**
   * Records that a match has been found and stores the server's match-found payload (R2.6).
   * @param payload - the match:found event payload from the server
   */
  setMatched(payload: MatchFoundPayload): void {
    throw new NotImplementedError('ClientQueueModel.setMatched not yet implemented');
  }
}
```

---

## 2. Implementation

### `ClientIdentityModel`

Design notes before you write a line:
- `identify(username)` is called by the controller after the player submits a username. Its job is
  to store the username locally and persist it to `sessionStorage` — and, if a `playerId` was
  previously stored in `sessionStorage` (page-reload scenario, R1.2), restore it.
- The controller sets `model.playerId` directly (it's a public field) after the server responds with
  the `IdentifyPayload`, and separately stores it to `sessionStorage['arena:playerId']`.
- `getPlayerId()` must throw `PlayerNotFoundError` (from `@arena/shared`) if `playerId` is still
  `null`. **Do not throw `NotImplementedError` or any other type.**
- Guard `sessionStorage` access with `typeof sessionStorage !== 'undefined'` so the class works in
  non-browser test environments. The client's Jest config uses `jest-environment-jsdom`, which
  provides `sessionStorage`, so all `sessionStorage` branches are exercised in the normal test run.

```ts
import { AbstractModel, PlayerId, PlayerNotFoundError } from '@arena/shared';

export class ClientIdentityModel extends AbstractModel {
  public playerId: PlayerId | null = null;
  public username: string | null = null;

  identify(username: string): void {
    this.username = username;
    // Guard for non-browser environments; jsdom provides sessionStorage in tests.
    const storage: Storage | null =
      typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    if (storage) {
      storage.setItem('arena:username', username);
      const storedId = storage.getItem('arena:playerId');
      if (storedId !== null) {
        this.playerId = storedId;
      }
    }
  }

  getPlayerId(): PlayerId {
    if (this.playerId === null) {
      throw new PlayerNotFoundError('(not yet identified)');
    }
    return this.playerId;
  }
}
```

### `ClientQueueModel`

Add a `matchPayload` field to hold the `MatchFoundPayload` from `setMatched()` — the stub omits it
but the controller and views need it. Confirm the field is in `docs/01_class_list.md`; if it is
listed there (it should be), add it. If it is not, add it and update the class list in the same
commit, noting the deviation in your commit message.

```ts
import { AbstractModel, MatchFoundPayload } from '@arena/shared';

export type QueueStatus = 'idle' | 'queued' | 'matched';

export class ClientQueueModel extends AbstractModel {
  public status: QueueStatus = 'idle';
  public position: number | null = null;
  public matchPayload: MatchFoundPayload | null = null;

  setQueued(position: number): void {
    this.status = 'queued';
    this.position = position;
  }

  setCancelled(): void {
    this.status = 'idle';
    this.position = null;
  }

  setMatched(payload: MatchFoundPayload): void {
    this.status = 'matched';
    this.position = null;
    this.matchPayload = payload;
  }
}
```

---

## 3. Test file

Create `packages/client/src/model/__tests__/ClientIdentityModel.test.ts`:

```ts
import { ClientIdentityModel } from '../ClientIdentityModel';
import { PlayerNotFoundError } from '@arena/shared';

describe('ClientIdentityModel', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('identify()', () => {
    it('stores username exactly as given — no alteration', () => {
      const m = new ClientIdentityModel();
      m.identify('TestUser');
      expect(m.username).toBe('TestUser');
    });

    it('persists username to sessionStorage', () => {
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(sessionStorage.getItem('arena:username')).toBe('Raj');
    });

    it('restores playerId from sessionStorage if already set (page-reload scenario)', () => {
      sessionStorage.setItem('arena:playerId', 'player-99');
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(m.playerId).toBe('player-99');
    });

    it('leaves playerId null when sessionStorage has no stored playerId', () => {
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(m.playerId).toBeNull();
    });
  });

  describe('getPlayerId()', () => {
    it('throws PlayerNotFoundError before identify() is called', () => {
      expect(() => new ClientIdentityModel().getPlayerId()).toThrow(PlayerNotFoundError);
    });

    it('throws PlayerNotFoundError after identify() when server has not yet set playerId', () => {
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(() => m.getPlayerId()).toThrow(PlayerNotFoundError);
    });

    it('returns playerId once the controller has set it', () => {
      const m = new ClientIdentityModel();
      m.playerId = 'player-42';
      expect(m.getPlayerId()).toBe('player-42');
    });

    it('returns the restored playerId after page-reload scenario', () => {
      sessionStorage.setItem('arena:playerId', 'player-7');
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(m.getPlayerId()).toBe('player-7');
    });
  });
});
```

Create `packages/client/src/model/__tests__/ClientQueueModel.test.ts`:

```ts
import { ClientQueueModel } from '../ClientQueueModel';
import { Team } from '@arena/shared';

const makeMatchFoundPayload = () => ({
  matchId: 'match-1',
  team: Team.A,
  opponentUsername: 'Opponent',
  roster: [],
});

describe('ClientQueueModel', () => {
  it('starts with idle status and null position', () => {
    const m = new ClientQueueModel();
    expect(m.status).toBe('idle');
    expect(m.position).toBeNull();
  });

  describe('setQueued()', () => {
    it('stores position exactly as given by the server — no alteration', () => {
      const m = new ClientQueueModel();
      m.setQueued(3);
      expect(m.position).toBe(3);
    });

    it('sets status to queued', () => {
      const m = new ClientQueueModel();
      m.setQueued(1);
      expect(m.status).toBe('queued');
    });
  });

  describe('setCancelled()', () => {
    it('resets status to idle and clears position', () => {
      const m = new ClientQueueModel();
      m.setQueued(2);
      m.setCancelled();
      expect(m.status).toBe('idle');
      expect(m.position).toBeNull();
    });
  });

  describe('setMatched()', () => {
    it('stores the match-found payload exactly as given — same reference, no alteration', () => {
      const m = new ClientQueueModel();
      const payload = makeMatchFoundPayload();
      m.setMatched(payload);
      expect(m.matchPayload).toBe(payload); // same reference — not cloned or mutated
    });

    it('sets status to matched and clears position', () => {
      const m = new ClientQueueModel();
      m.setQueued(1);
      m.setMatched(makeMatchFoundPayload());
      expect(m.status).toBe('matched');
      expect(m.position).toBeNull();
    });
  });
});
```

---

## 4. Verification and Git

**Step 1 — typecheck:**
```
npm run typecheck -w @arena/client
```
Must pass with no new errors introduced by your changes.

**Step 2 — tests with coverage:**
```
npx jest --testPathPattern="ClientIdentityModel|ClientQueueModel" --coverage --coveragePathPattern="model/(ClientIdentityModel|ClientQueueModel)"
```
Expected: **8 tests pass** (4 per file), **100% statements, 100% branches, 100% functions** on both
implementation files. If coverage is below 100%, add tests for the uncovered branch before committing.

**Step 3 — revert test files before committing:** The test files stay. Only the two implementation
files are committed here.

**Step 4 — git:**
```bash
git add packages/client/src/model/ClientIdentityModel.ts \
        packages/client/src/model/ClientQueueModel.ts \
        packages/client/src/model/__tests__/ClientIdentityModel.test.ts \
        packages/client/src/model/__tests__/ClientQueueModel.test.ts
git commit -m "Step 9 client: implement ClientIdentityModel + ClientQueueModel"
git push origin client
```

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `identify()` writes to sessionStorage and reads from it — but it never decides a
PlayerId. The PlayerId is always set externally (by the controller, from the server's response).
`getPlayerId()` is read-only. `setQueued()` / `setCancelled()` / `setMatched()` store server-sent
values as-is — none of them compute a new value. A test asserting "the stored value equals the
input with no fields changed" must exist for each mutating method.**
