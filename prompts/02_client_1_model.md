# Prompt 02_client_1 — Client Model Package

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm the `shared` branch has been merged to `main` and
`client` branches from that merged `main`.** This prompt fills in `packages/client/src/model/`
(`docs/01_class_list.md` §6a). **MANDATORY**: nothing here may mutate a value received from the server —
these models mirror server state for display, per the master context §1.1 rule that the client never
asserts an outcome.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/client/src/model/*.ts` are empty placeholders; `@arena/shared` is installed.
- **End**: `docs/01_class_list.md` §6a matches these files; no method here computes a game-authoritative
  value (damage, cooldowns, win/loss) — only display state derived from what the server already sent.

---

### 1. `model/ClientIdentityModel.ts`
```ts
import { AbstractModel, PlayerId, NotImplementedError } from '@arena/shared';

export class ClientIdentityModel extends AbstractModel {
  public playerId: PlayerId | null = null;
  public username: string | null = null;

  /** Persists to sessionStorage per R1.2 (same identifier survives a page reload within the session). */
  identify(username: string): void {
    throw new NotImplementedError('ClientIdentityModel.identify not yet implemented');
  }

  /** @throws PlayerNotFoundError-equivalent client-side check if called before identify(). */
  getPlayerId(): PlayerId {
    throw new NotImplementedError('ClientIdentityModel.getPlayerId not yet implemented');
  }
}
```

### 2. `model/ClientQueueModel.ts`
```ts
import { AbstractModel, MatchFoundPayload, NotImplementedError } from '@arena/shared';

export type QueueStatus = 'idle' | 'queued' | 'matched';

export class ClientQueueModel extends AbstractModel {
  public status: QueueStatus = 'idle';
  public position: number | null = null;

  setQueued(position: number): void {
    throw new NotImplementedError('ClientQueueModel.setQueued not yet implemented');
  }

  setCancelled(): void {
    throw new NotImplementedError('ClientQueueModel.setCancelled not yet implemented');
  }

  setMatched(payload: MatchFoundPayload): void {
    throw new NotImplementedError('ClientQueueModel.setMatched not yet implemented');
  }
}
```

### 3. `model/ClientMatchModel.ts`
```ts
import {
  AbstractModel, MatchId, MatchPhase, NotImplementedError,
  ChampionSelectedPayload, MatchStartPayload, MatchStatePayload, MatchEndPayload,
} from '@arena/shared';

export class ClientMatchModel extends AbstractModel {
  public matchId: MatchId | null = null;
  public phase: MatchPhase | null = null;
  public latestState: MatchStatePayload | null = null;
  public result: MatchEndPayload | null = null;

  applyChampionSelected(payload: ChampionSelectedPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyChampionSelected not yet implemented');
  }

  applyMatchStart(payload: MatchStartPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchStart not yet implemented');
  }

  /** R4.7: stores the snapshot as-is; must not merge/alter values before storing. */
  applyMatchState(payload: MatchStatePayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchState not yet implemented');
  }

  applyMatchEnd(payload: MatchEndPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchEnd not yet implemented');
  }
}
```

### 4. `model/InterpolationBuffer.ts`
```ts
import { MatchStatePayload, PlayerId, Position, NotImplementedError } from '@arena/shared';

export class InterpolationBuffer {
  private samples: MatchStatePayload[] = [];

  constructor(private readonly capacity: number) {}

  push(snapshot: MatchStatePayload): void {
    throw new NotImplementedError('InterpolationBuffer.push not yet implemented');
  }

  /**
   * CRITICAL CHECKPOINT (prompts/00_master_context.md §8): must produce a Position for rendering only —
   * never write back into ClientMatchModel or any authoritative field. R4.7 / R-P4.
   */
  getInterpolatedPosition(playerId: PlayerId, now: number): Position {
    throw new NotImplementedError('InterpolationBuffer.getInterpolatedPosition not yet implemented');
  }
}
```

---

### 5. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` succeeds. Branch `client` from `main`,
commit `Step 2: client model package`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Confirm no method above independently computes damage, cooldowns, or a win/loss outcome — if
one does, it belongs in `packages/server`, not here, and this prompt's output is wrong.**
