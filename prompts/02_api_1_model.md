# Prompt 02_api_1 — API Model Package (Persistence)

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm the `shared` branch has been merged to `main` and
`api` branches from that merged `main`.** This prompt fills in `packages/api/src/model/` and
`packages/api/src/util/PgPool.ts` (`docs/01_class_list.md` §7a). **MANDATORY**: every repository method
that touches the database is declared `async` and documented `@throws PersistenceError` — nothing here may
throw a raw `pg` driver error out to a controller.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/api/src/model/*.ts` and `packages/api/src/util/PgPool.ts` are empty placeholders.
- **End**: `docs/01_class_list.md` §7a matches these files; every database-touching method is `async` and
  returns a `Promise`.

---

### 1. `util/PgPool.ts`
```ts
import { PersistenceError, NotImplementedError } from '@arena/shared';

export class PgPool {
  constructor(private readonly connectionString: string) {}

  /** @throws PersistenceError */
  async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    throw new NotImplementedError('PgPool.query not yet implemented');
  }
}
```

### 2. `model/PlayerRepository.ts`
```ts
import { Player, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';

export class PlayerRepository {
  constructor(private readonly pool: PgPool) {}

  /** Auto-creates a Player row the first time a username is seen (R-DB1, 3.2.1). @throws PersistenceError */
  async findOrCreateByUsername(username: string): Promise<Player> {
    throw new NotImplementedError('PlayerRepository.findOrCreateByUsername not yet implemented');
  }
}
```

### 3. `model/MatchRepository.ts`
```ts
import { Match, MatchParticipant, PlayerId, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';

export class MatchRepository {
  constructor(private readonly pool: PgPool) {}

  /** @throws PersistenceError — R7.1, R-DB2, R-DB4 (exactly one match-participant row per player). */
  async recordMatch(match: Match, participants: MatchParticipant[]): Promise<void> {
    throw new NotImplementedError('MatchRepository.recordMatch not yet implemented');
  }

  /** Most-recent-first, paginated (R7.3, R-DB5). */
  async findHistoryForPlayer(playerId: PlayerId, page: number, pageSize: number): Promise<MatchParticipant[]> {
    throw new NotImplementedError('MatchRepository.findHistoryForPlayer not yet implemented');
  }
}
```

### 4. `model/LeaderboardEntry.ts`
```ts
import { PlayerId } from '@arena/shared';
import { NotImplementedError } from '@arena/shared';

export class LeaderboardEntry {
  constructor(
    public readonly playerId: PlayerId,
    public readonly username: string,
    public readonly wins: number,
    public readonly losses: number,
    public readonly draws: number,
    public readonly gamesPlayed: number,
    public readonly winRate: number,
  ) {}

  static fromRow(row: Record<string, unknown>): LeaderboardEntry {
    throw new NotImplementedError('LeaderboardEntry.fromRow not yet implemented');
  }
}
```

### 5. `model/LeaderboardRepository.ts`
```ts
import { ChampionWinRateDTO, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';
import { LeaderboardEntry } from './LeaderboardEntry';

export class LeaderboardRepository {
  constructor(private readonly pool: PgPool) {}

  /** Win rate = wins / gamesPlayed, derived from match history, not a running total (R8.1). Excludes
   *  players below minGames (R8.2, default 1 — see prompts/00_master_context.md §4.1). */
  async computeLeaderboard(minGames: number): Promise<LeaderboardEntry[]> {
    throw new NotImplementedError('LeaderboardRepository.computeLeaderboard not yet implemented');
  }

  async computeChampionWinRates(): Promise<ChampionWinRateDTO[]> {
    throw new NotImplementedError('LeaderboardRepository.computeChampionWinRates not yet implemented');
  }
}
```

### 6. `model/PendingMatchCorrelator.ts`
```ts
import { MatchId, NotImplementedError } from '@arena/shared';

interface PendingRecord {
  begin?: unknown;
  end?: unknown;
}

/**
 * Reconciles the server's two separate HTTP reports (match begin, match end — SRS 3.2.7.4 step 26) into
 * one record ready for MatchRepository.recordMatch(). CRITICAL CHECKPOINT (prompts/00_master_context.md
 * §8): recordEnd/recordBegin must be idempotent per matchId — a retried report must not double-persist.
 */
export class PendingMatchCorrelator {
  private pending: Map<MatchId, PendingRecord> = new Map();

  recordBegin(matchId: MatchId, participants: unknown): void {
    throw new NotImplementedError('PendingMatchCorrelator.recordBegin not yet implemented');
  }

  /** Returns the combined record once both halves are present, otherwise null. */
  recordEnd(matchId: MatchId, outcome: unknown): PendingRecord | null {
    throw new NotImplementedError('PendingMatchCorrelator.recordEnd not yet implemented');
  }
}
```

---

### 7. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/api` succeeds. Branch `api` from `main`, commit
`Step 2: api model package (persistence)`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: No method in this file may be called synchronously from `packages/server` — the server only
ever reaches this code indirectly, over HTTP, via `MatchReportingClient` → `InternalMatchController`
(`02_server_2`, `02_api_2`).**
