# Prompt 02_api_3 — API View Package and Entry Point

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm `02_api_2` (api controllers) is merged.** This
prompt fills in `packages/api/src/view/`, `ApiMain.ts`, and `index.ts` (`docs/01_class_list.md` §7c–d) —
the last api prompt in Step 2. **MANDATORY**: response-formatting views are plain classes with a
`render()` method, **not** `View` implementers — a synchronous HTTP response has no push/observe semantics
for `getController()`/`setController()` to mean anything, unlike the server's broadcast views.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/api/src/view/*.ts`, `ApiMain.ts`, `index.ts` are empty placeholders; api `model/`
  and `controller/` are complete.
- **End**: `npm run typecheck -w @arena/api` succeeds — this closes out `packages/api`'s Step 2 skeleton.

---

### 1. `view/LeaderboardResponseView.ts`
```ts
import { LeaderboardEntryDTO, NotImplementedError } from '@arena/shared';
import { LeaderboardEntry } from '../model/LeaderboardEntry';

export class LeaderboardResponseView {
  render(entries: LeaderboardEntry[]): LeaderboardEntryDTO[] {
    throw new NotImplementedError('LeaderboardResponseView.render not yet implemented');
  }
}
```

### 2. `view/MatchHistoryResponseView.ts`
```ts
import { MatchHistoryEntryDTO, MatchParticipant, NotImplementedError } from '@arena/shared';

export class MatchHistoryResponseView {
  render(participants: MatchParticipant[]): MatchHistoryEntryDTO[] {
    throw new NotImplementedError('MatchHistoryResponseView.render not yet implemented');
  }
}
```

### 3. `view/ErrorResponseView.ts`
```ts
import { ArenaError, NotImplementedError } from '@arena/shared';

export class ErrorResponseView {
  render(error: ArenaError): { status: number; body: { code: string; message: string } } {
    throw new NotImplementedError('ErrorResponseView.render not yet implemented');
  }
}
```

### 4. `ApiMain.ts`
```ts
import { NotImplementedError } from '@arena/shared';

export class ApiMain {
  /** Builds the Express app, wires middleware and the three controllers to routes, connects PgPool, listens. */
  static async main(): Promise<void> {
    throw new NotImplementedError('ApiMain.main not yet implemented');
  }
}
```

### 5. `index.ts`
```ts
import { ApiMain } from './ApiMain';

ApiMain.main().catch((err) => {
  console.error('Arena API failed to start:', err);
  process.exit(1);
});
```

---

### 6. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/api` succeeds. Branch `api`, commit
`Step 2: api view package and ApiMain entry point`, push, then **open a PR merging `api` into `main`** —
api's Step 2 skeleton is now complete, and with it, all of Step 2.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Once this merges, all 13 boxes in `prompts/README.md`'s Step 2 table should be checked in the
same commit — that table is the record of Step 2 being done, not this file.**
