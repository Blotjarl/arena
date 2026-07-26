# Prompt 09_api_2 — PostgreSQL Schema, Test Database, and PgPool

**Owner: Marshall** (infrastructure prerequisite for En's repository prompts — `09_api_3` through
`09_api_5` all depend on this). Load `prompts/00_master_context.md` and
`prompts/09-10_implementation_plan.md` (§3, database testing approach) first. Everything below is already
validated: schema applied to a real `postgres:16` container, `PgPool` tested against it with real INSERT/
SELECT/constraint-violation queries, zero mocking.

---

### 1. Create `packages/api/schema.sql`:

```sql
-- Arena persistence schema (docs/01_class_list.md §3.4 Logical Database Requirements).
-- Applied via docker-compose.test.yml's postgres init-scripts mechanism for tests; the same file is the
-- schema for a real deployment (no migration framework — this is a term project, not a system with a
-- schema history to manage, per prompts/09-10_implementation_plan.md §3).

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  end_reason TEXT NOT NULL
    CHECK (end_reason IN ('ELIMINATION', 'TIME_LIMIT', 'DISCONNECT_FORFEIT', 'SELECTION_TIMEOUT')),
  winning_team TEXT CHECK (winning_team IN ('A', 'B')), -- null = draw (R-DB3)
  duration_ms INTEGER NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE match_participants (
  match_id TEXT NOT NULL REFERENCES matches(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  team TEXT NOT NULL CHECK (team IN ('A', 'B')),
  champion_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('WIN', 'LOSS', 'DRAW')),
  PRIMARY KEY (match_id, player_id) -- R-DB4: cannot exist without both a match and a player
);

-- R-DB5: efficient retrieval by player (match history) and by champion (win-rate aggregation), without
-- scanning the full table.
CREATE INDEX idx_match_participants_player ON match_participants(player_id);
CREATE INDEX idx_match_participants_champion ON match_participants(champion_id);
```

**IMPORTANT design note for whoever implements `PlayerRepository`/`MatchRepository` next (`09_api_3`,
`09_api_4`)**: SRS 3.4 says a `Player` row is "one record per unique username" (hence the `UNIQUE`
constraint above), but SRS R1.2 says the live match's `PlayerId` is a client-generated token stable only
*for the browser session* — the two are not guaranteed to be the same value across different sessions for
the same person. `PlayerRepository.findOrCreateByUsername(username)` must resolve by **username**, not by
whatever transient id a live match used, and return the canonical stored `id`. `MatchRepository.recordMatch`
must use that canonical id when writing `match_participants` rows, not the live match's session-scoped
`PlayerId` directly.

### 2. Create `docker-compose.test.yml` at the **repo root**:

```yaml
services:
  postgres-test:
    image: postgres:16
    environment:
      POSTGRES_USER: arena
      POSTGRES_PASSWORD: arena
      POSTGRES_DB: arena_test
    ports:
      - "55432:5432"
    volumes:
      - ./packages/api/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
    tmpfs:
      - /var/lib/postgresql/data # ephemeral -- no state persists between `docker compose up`s
```

### 3. Add to root `package.json` scripts:
```json
"test:db:up": "docker compose -f docker-compose.test.yml up -d",
"test:db:down": "docker compose -f docker-compose.test.yml down"
```

### 4. Replace `packages/api/src/util/PgPool.ts` with:

```ts
import { Pool } from 'pg';
import { PersistenceError } from '@arena/shared';

/** Thin wrapper over the PostgreSQL connection pool (R-D3) — the only class in `packages/api` that talks to
 *  `pg` directly; every `*Repository` depends on it rather than importing `pg` itself. */
export class PgPool {
  private readonly pool: Pool;

  /** @param connectionString - the PostgreSQL connection string to pool connections against */
  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  /**
   * Runs a parameterized SQL query against the pool.
   * @param sql - the SQL text, with $1/$2/... placeholders
   * @param params - values bound to the query's placeholders
   * @returns the query's result rows
   * @throws {PersistenceError} if the underlying query fails (connection drop, constraint violation,
   *   timeout, or any other driver-level failure)
   */
  async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    try {
      const result = await this.pool.query(sql, params);
      return result.rows as T[];
    } catch (err) {
      throw new PersistenceError('query', err);
    }
  }

  /** Closes all pooled connections — call once on process shutdown, and in test teardown. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
```
**Addition beyond the original stub**: `close()` — not in `docs/01_class_list.md`'s original declaration,
added because tests (and real process shutdown) need a clean way to release pooled connections. Add this
method to the class list's `PgPool` row.

### 5. Create `packages/api/src/util/PgPool.test.ts`:

```ts
import { PersistenceError } from '@arena/shared';
import { PgPool } from './PgPool';

// Requires `npm run test:db:up` first -- packages/api/schema.sql is applied automatically via Postgres's
// init-scripts mechanism when the container first starts.
const TEST_CONNECTION_STRING = 'postgresql://arena:arena@localhost:55432/arena_test';

describe('PgPool (integration — real PostgreSQL)', () => {
  let pool: PgPool;

  beforeAll(() => {
    pool = new PgPool(TEST_CONNECTION_STRING);
  });

  afterAll(async () => {
    await pool.close();
  });

  it('runs a parameterized query against the real schema and returns rows', async () => {
    await pool.query('DELETE FROM players WHERE id = $1', ['test-player-1']);
    await pool.query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-player-1', 'IntegrationTester']);
    const rows = await pool.query<{ id: string; username: string }>(
      'SELECT id, username FROM players WHERE id = $1',
      ['test-player-1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe('IntegrationTester');
    await pool.query('DELETE FROM players WHERE id = $1', ['test-player-1']);
  });

  it('throws PersistenceError, not a raw pg error, on a constraint violation', async () => {
    await pool.query('DELETE FROM players WHERE id = $1', ['test-player-2']);
    await pool.query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-player-2', 'DupeCheck']);
    await expect(
      pool.query('INSERT INTO players (id, username) VALUES ($1, $2)', ['test-player-2-dup', 'DupeCheck']),
    ).rejects.toThrow(PersistenceError); // username UNIQUE constraint
    await pool.query('DELETE FROM players WHERE id = $1', ['test-player-2']);
  });

  it('throws PersistenceError on malformed SQL rather than letting the driver error escape', async () => {
    await expect(pool.query('SELECT * FROM this_table_does_not_exist', [])).rejects.toThrow(PersistenceError);
  });

  it('enforces the schema CHECK constraint on matches.end_reason', async () => {
    await expect(
      pool.query(
        "INSERT INTO matches (id, end_reason, duration_ms, ended_at) VALUES ($1, 'NOT_A_REAL_REASON', 1000, now())",
        ['test-match-1'],
      ),
    ).rejects.toThrow(PersistenceError);
  });
});
```

---

### 6. Verification and Git
```
npm run test:db:up
# wait for it to be ready: docker exec <container> pg_isready -U arena (retry a few times)
npm run typecheck -w @arena/api
npx jest PgPool --coverage --collectCoverageFrom="src/util/PgPool.ts" -w @arena/api  # or run from packages/api directly
npm run test:db:down
```
Validated result: 4/4 tests passing, 100% statements/branch/function/line coverage on `PgPool.ts`, schema's
`UNIQUE`/`CHECK` constraints confirmed actually enforced (not just declared). Per master context §9.4:
branch `api` from `main` (`git branch -D api 2>/dev/null; git checkout -b api main`), commit `Step 9:
PostgreSQL schema, test database, and PgPool implementation`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `09_api_3` through `09_api_5` (the repository prompts) all assume this PR is merged and
`npm run test:db:up` works — do not let those proceed until this one is confirmed working end to end,
including the actual `docker compose` commands succeeding, not just the code compiling.**
