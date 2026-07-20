# Prompt 02_api_2 — API Controller Package

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm `02_api_1` (api model) is merged.** This prompt
fills in `packages/api/src/controller/` (`docs/01_class_list.md` §7b). **MANDATORY**: each class extends
`AbstractController` for MVC-framework consistency across the whole system, but the real entry points are
the per-route handler methods (`handleBegin`, `getHistory`, etc.) — Express's routing already dispatches
by HTTP method + path, so `operation()` is a thin, mostly-unused pass-through here, not the primary path.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/api/src/controller/*.ts` are empty placeholders; api `model/` is complete.
- **End**: every route handler method is `async`, matches an endpoint named in
  `docs/01_class_list.md` §7b, and compiles against the loose `AbstractController` generics.

---

### 1. `controller/InternalMatchController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/** POST /internal/matches/begin and /end — not public-facing; only MatchReportingClient (server package) calls these, over the deployment's private network. */
export class InternalMatchController extends AbstractController {
  async handleBegin(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('InternalMatchController.handleBegin not yet implemented');
  }

  async handleEnd(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('InternalMatchController.handleEnd not yet implemented');
  }

  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('InternalMatchController.operation not yet implemented');
  }
}
```

### 2. `controller/MatchHistoryController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/** GET /players/:id/matches?page=&pageSize= (R7.3). */
export class MatchHistoryController extends AbstractController {
  async getHistory(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('MatchHistoryController.getHistory not yet implemented');
  }

  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchHistoryController.operation not yet implemented');
  }
}
```

### 3. `controller/LeaderboardController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';
import type { Request, Response } from 'express';

/** GET /leaderboard, GET /leaderboard/champions (R8.1–R8.3). */
export class LeaderboardController extends AbstractController {
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('LeaderboardController.getLeaderboard not yet implemented');
  }

  async getChampionWinRates(req: Request, res: Response): Promise<void> {
    throw new NotImplementedError('LeaderboardController.getChampionWinRates not yet implemented');
  }

  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('LeaderboardController.operation not yet implemented');
  }
}
```

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/api` succeeds. Branch `api`, commit
`Step 2: api controller package`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `InternalMatchController`'s routes must never be registered on the same public router as
`MatchHistoryController`/`LeaderboardController` once `ApiMain` wires routing in `02_api_3` — flag this
for that prompt if it isn't already obvious from context.**
