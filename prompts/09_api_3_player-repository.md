# Prompt 09_api_3 — PlayerRepository Implementation

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` (§3, database
testing approach) first. This prompt's code below is already validated (implemented and test-run against a
real `postgres:16` container, then reverted to the stub so the actual commit happens through your own
branch/PR flow) — you are transcribing proven work, not designing from scratch. Still run everything
yourself; don't skip verification.

### CRITICAL prerequisite
**`09_api_2_schema-and-pgpool.md` must already be merged to `main`** — this prompt needs
`packages/api/schema.sql`, `docker-compose.test.yml`, and the real `PgPool` it produced. If
`packages/api/schema.sql` doesn't exist on your branch yet, stop and merge/rebase onto that work first.

### CRITICAL design note — carried verbatim from `09_api_2` (do not lose this)
SRS 3.4 says a `Player` row is "one record per unique username" (hence the schema's `UNIQUE` constraint on
`players.username`), but SRS R1.2 says the live match's `PlayerId` is a client-generated token stable only
*for the browser session* — the two are not guaranteed to be the same value across different sessions for
the same person. **`PlayerRepository.findOrCreateByUsername(username)` must resolve by username, not by
whatever transient client-generated `PlayerId` a live match used, and return the canonical stored id.**

---

### 1. Replace `packages/api/src/model/PlayerRepository.ts` with:

```ts
import { randomUUID } from 'crypto';
import { Player } from '@arena/shared';
import { PgPool } from '../util/PgPool';

interface PlayerRow {
  id: string;
  username: string;
  created_at: string;
}

function toPlayer(row: PlayerRow): Player {
  return new Player(row.id, row.username, new Date(row.created_at));
}

/** Persists and looks up `Player` rows. The only repository player identity flows through (R1.1, 3.2.1). */
export class PlayerRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Finds the Player row for a username, creating one if this is the first time it's been seen (R-DB1,
   * SRS 3.2.1 — there is no separate registration step). Resolves by **username**, not by whatever
   * transient client-generated PlayerId a live match used — SRS 3.4 keys `Player` rows by unique username,
   * while the live match's id is only stable within one browser session (R1.2). Returns the canonical
   * stored id.
   * @param username - the client-supplied username
   * @returns the existing or newly-created Player
   * @throws {PersistenceError} if the underlying query fails
   */
  async findOrCreateByUsername(username: string): Promise<Player> {
    const existing = await this.pool.query<PlayerRow>('SELECT id, username, created_at FROM players WHERE username = $1', [
      username,
    ]);
    if (existing.length > 0) {
      return toPlayer(existing[0]);
    }
    const id = randomUUID();
    const created = await this.pool.query<PlayerRow>(
      'INSERT INTO players (id, username) VALUES ($1, $2) RETURNING id, username, created_at',
      [id, username],
    );
    return toPlayer(created[0]);
  }
}
```

`randomUUID()` comes from Node's built-in `crypto` module (available since Node 14.17, no extra
dependency) — used as the server-generated id for a brand-new `Player` row.

**Known simplification, in scope for this course project**: the select-then-insert above has a narrow
race window if two requests for the same brand-new username land concurrently (both could pass the
`SELECT`, then the second `INSERT` would hit the `UNIQUE` constraint and throw `PersistenceError`). Given
Node's single-threaded event loop, this only matters across two truly concurrent HTTP requests to
`InternalMatchController`/a future player-identify endpoint for the exact same never-before-seen username,
which the SRS does not call out as a scenario to guard against. Not fixed here; flag it if it ever becomes
a real requirement (an `INSERT ... ON CONFLICT (username) DO UPDATE ... RETURNING *` upsert would close it
in one round trip).

### 2. Create `packages/api/src/model/PlayerRepository.test.ts` with:

```ts
import { PgPool } from '../util/PgPool';
import { PlayerRepository } from './PlayerRepository';

// Requires `npm run test:db:up` first -- packages/api/schema.sql is applied automatically via Postgres's
// init-scripts mechanism when the container first starts.
const TEST_CONNECTION_STRING = 'postgresql://arena:arena@localhost:55432/arena_test';

describe('PlayerRepository (integration — real PostgreSQL)', () => {
  let pool: PgPool;
  let repo: PlayerRepository;

  beforeAll(() => {
    pool = new PgPool(TEST_CONNECTION_STRING);
    repo = new PlayerRepository(pool);
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM players WHERE username LIKE $1', ['PlayerRepoTest%']);
  });

  it('creates a new Player row when the username has not been seen before', async () => {
    const player = await repo.findOrCreateByUsername('PlayerRepoTestNew');
    expect(player.username).toBe('PlayerRepoTestNew');
    expect(typeof player.id).toBe('string');
    expect(player.id.length).toBeGreaterThan(0);
    expect(player.createdAt).toBeInstanceOf(Date);

    const rows = await pool.query<{ id: string }>('SELECT id FROM players WHERE username = $1', ['PlayerRepoTestNew']);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(player.id);
  });

  it('returns the existing Player row (same id) on a repeat lookup, without creating a duplicate', async () => {
    const first = await repo.findOrCreateByUsername('PlayerRepoTestExisting');
    const second = await repo.findOrCreateByUsername('PlayerRepoTestExisting');

    expect(second.id).toBe(first.id);
    expect(second.username).toBe('PlayerRepoTestExisting');

    const rows = await pool.query('SELECT id FROM players WHERE username = $1', ['PlayerRepoTestExisting']);
    expect(rows).toHaveLength(1);
  });

  it('resolves by username, not by a caller-supplied transient id — the canonical id is server-generated', async () => {
    const player = await repo.findOrCreateByUsername('PlayerRepoTestCanonical');
    // A second call with the same username must return the same canonical id regardless of any
    // session-scoped PlayerId a live match might have used (SRS R1.2 / 09_api_2's design note).
    const again = await repo.findOrCreateByUsername('PlayerRepoTestCanonical');
    expect(again.id).toBe(player.id);
  });
});
```

---

### 3. Verification and Git
```
npm run test:db:up
# wait for it to be ready: docker exec <container> pg_isready -U arena (retry a few times)
npm run typecheck -w @arena/api
npx jest PlayerRepository --coverage --collectCoverageFrom="src/model/PlayerRepository.ts"
npm run test:db:down
```
Validated result: 3/3 tests passing, 100% statement/branch/function/line coverage on
`PlayerRepository.ts` — both the "existing player found" and "new player created" branches exercised
against the real schema's `UNIQUE` constraint. Per master context §9.4: branch `api` from `main`
(`git branch -D api 2>/dev/null; git checkout -b api main`) if you don't already have work in progress on
it, commit `Step 9: PlayerRepository implementation and tests`, push, open a PR into `main` (or fold into
an existing in-flight `api`-branch PR alongside the other three prompts in this batch).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `MatchRepository` (`09_api_4`) writes `match_participants.player_id` values that must already
be canonical ids produced by this class — do not let a future controller pass a live match's session-scoped
`PlayerId` straight into persistence without going through `findOrCreateByUsername` first.**
