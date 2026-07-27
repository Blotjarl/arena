# Prompt 10_api_3 — LeaderboardController + LeaderboardResponseView Implementation

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first. This
prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisites
1. `packages/api`'s entire model package (`09_api_1` through `09_api_5`) must already be merged to `main` —
   confirm via `git log`. This prompt depends directly on `LeaderboardRepository` (`09_api_5`) and
   `LeaderboardEntry` (`09_api_4`).
2. **`10_api_1` must be merged first** — this prompt imports `NULL_MODEL`/`NULL_VIEW` from
   `packages/api/src/controller/nullMvc.ts`, created there. Do not recreate that file here.

---

### Design note 1: `minGames` default and validation
Per `prompts/00_master_context.md` §4.1, the leaderboard minimum-games default is **1** (R8.2). When the
`minGames` query param is omitted entirely, `getLeaderboard` uses that default; when present, it must parse
as a non-negative integer (`0` is valid — R8.2 doesn't require players have played at least one game to be
theoretically includable at `minGames=0`) or the request is rejected with `ValidationError`.

### Design note 2: `getChampionWinRates` needs no response view
Unlike `getLeaderboard` (which maps the domain `LeaderboardEntry[]` to the wire-shaped
`LeaderboardEntryDTO[]`, dropping `playerId`), `LeaderboardRepository.computeChampionWinRates()` already
returns `ChampionWinRateDTO[]` directly — `docs/01_class_list.md` has no separate `ChampionWinRate` domain
class to bridge from, so there is no domain-vs-DTO gap for a view to close here. `getChampionWinRates`
passes the repository's result straight to `res.json(...)`.

### Design note 3: shared `NULL_MODEL`/`NULL_VIEW`
Same reasoning as `MatchHistoryController` (`10_api_2`) and `InternalMatchController` (`10_api_1`) — see
`10_api_1`'s design note 4. `LeaderboardController` uses the default (untyped) `AbstractController`
generics via the shared `nullMvc.ts` helper from `10_api_1`.

---

### 1. Replace `packages/api/src/view/LeaderboardResponseView.ts` with:

```ts
import { LeaderboardEntryDTO } from '@arena/shared';
import { LeaderboardEntry } from '../model/LeaderboardEntry';

/**
 * Formats `LeaderboardEntry[]` into the wire-shaped `LeaderboardEntryDTO[]` for a REST response. A plain
 * formatter, not a `View` implementer — a synchronous HTTP response has no push/observe relationship to
 * establish.
 */
export class LeaderboardResponseView {
  /**
   * @param entries - the computed leaderboard rows to format
   * @returns the DTO array to send as the JSON response body
   */
  render(entries: LeaderboardEntry[]): LeaderboardEntryDTO[] {
    return entries.map((entry) => ({
      username: entry.username,
      wins: entry.wins,
      losses: entry.losses,
      draws: entry.draws,
      gamesPlayed: entry.gamesPlayed,
      winRate: entry.winRate,
    }));
  }
}
```

### 2. Create `packages/api/src/view/LeaderboardResponseView.test.ts` with:

```ts
import { LeaderboardEntry } from '../model/LeaderboardEntry';
import { LeaderboardResponseView } from './LeaderboardResponseView';

describe('LeaderboardResponseView', () => {
  describe('render', () => {
    it('maps each LeaderboardEntry to a LeaderboardEntryDTO, dropping playerId', () => {
      const view = new LeaderboardResponseView();
      const entry = new LeaderboardEntry('p1', 'Alice', 7, 3, 0, 10, 0.7);
      const result = view.render([entry]);
      expect(result).toEqual([{ username: 'Alice', wins: 7, losses: 3, draws: 0, gamesPlayed: 10, winRate: 0.7 }]);
      expect(result[0]).not.toHaveProperty('playerId');
    });

    it('returns an empty array for an empty input', () => {
      const view = new LeaderboardResponseView();
      expect(view.render([])).toEqual([]);
    });

    it('preserves input order', () => {
      const view = new LeaderboardResponseView();
      const entries = [
        new LeaderboardEntry('p1', 'Alice', 7, 3, 0, 10, 0.7),
        new LeaderboardEntry('p2', 'Bob', 2, 8, 0, 10, 0.2),
      ];
      const result = view.render(entries);
      expect(result.map((r) => r.username)).toEqual(['Alice', 'Bob']);
    });
  });
});
```

### 3. Replace `packages/api/src/controller/LeaderboardController.ts` with:

```ts
import { AbstractController, NotImplementedError, ArenaError, ValidationError } from '@arena/shared';
import type { Request, Response } from 'express';
import { LeaderboardRepository } from '../model/LeaderboardRepository';
import { LeaderboardResponseView } from '../view/LeaderboardResponseView';
import { ErrorResponseView } from '../view/ErrorResponseView';
import { NULL_MODEL, NULL_VIEW } from './nullMvc';

/** Default `minGames` when the query param is omitted (R8.2, `prompts/00_master_context.md` §4.1). */
const DEFAULT_MIN_GAMES = 1;

/**
 * `GET /leaderboard` and `GET /leaderboard/champions` — serves aggregate standings (R8.1–R8.3).
 *
 * Uses the default (untyped) `AbstractController` generics via the shared `NULL_MODEL`/`NULL_VIEW`
 * stand-in — see `10_api_1`'s design note 4 for why.
 */
export class LeaderboardController extends AbstractController {
  constructor(
    private readonly leaderboardRepository: LeaderboardRepository,
    private readonly responseView: LeaderboardResponseView = new LeaderboardResponseView(),
    private readonly errorView: ErrorResponseView = new ErrorResponseView(),
  ) {
    super(NULL_MODEL, NULL_VIEW);
  }

  /**
   * Fetches leaderboard standings via `LeaderboardRepository.computeLeaderboard` and formats them through
   * `LeaderboardResponseView`. Catches any `ArenaError` and formats it via `ErrorResponseView` instead of
   * letting it propagate — same controller-catches/view-shows pattern as `InternalMatchController`
   * (`10_api_1`).
   * @param req - Express request, optionally carrying a `minGames` query param
   * @param res - Express response, written to directly rather than returned
   */
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const minGames = this.parseMinGames(req.query.minGames);
      const entries = await this.leaderboardRepository.computeLeaderboard(minGames);
      res.status(200).json(this.responseView.render(entries));
    } catch (err) {
      this.respondError(err, res);
    }
  }

  /**
   * Fetches per-champion win rates via `LeaderboardRepository.computeChampionWinRates`. No response-view
   * formatting step is needed here — `computeChampionWinRates` already returns the wire-shaped
   * `ChampionWinRateDTO[]` directly, since there's no domain-vs-DTO gap to bridge (unlike
   * `LeaderboardEntry`, there's no separate `ChampionWinRate` domain class per `docs/01_class_list.md`).
   * @param req - Express request
   * @param res - Express response, written to directly rather than returned
   */
  async getChampionWinRates(req: Request, res: Response): Promise<void> {
    try {
      const winRates = await this.leaderboardRepository.computeChampionWinRates();
      res.status(200).json(winRates);
    } catch (err) {
      this.respondError(err, res);
    }
  }

  private parseMinGames(raw: unknown): number {
    if (raw === undefined) return DEFAULT_MIN_GAMES;
    if (typeof raw !== 'string') {
      throw new ValidationError('minGames', 'must be a non-negative integer');
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new ValidationError('minGames', 'must be a non-negative integer');
    }
    return value;
  }

  private respondError(err: unknown, res: Response): void {
    if (err instanceof ArenaError) {
      const { status, body } = this.errorView.render(err);
      res.status(status).json(body);
      return;
    }
    throw err;
  }

  /**
   * Satisfies the `AbstractController` contract; unused in this controller's own request path, since
   * Express routes call `getLeaderboard`/`getChampionWinRates` directly rather than dispatching through
   * `operation`.
   * @param action - unused
   * @param payload - unused
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('LeaderboardController.operation not yet implemented');
  }
}
```

### 4. Create `packages/api/src/controller/LeaderboardController.test.ts` with:

```ts
import type { Request, Response } from 'express';
import { LeaderboardController } from './LeaderboardController';
import { LeaderboardRepository } from '../model/LeaderboardRepository';
import { LeaderboardEntry } from '../model/LeaderboardEntry';

function makeRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeReq(query: Record<string, unknown>): Request {
  return { query } as unknown as Request;
}

function makeRepo(overrides: Partial<LeaderboardRepository> = {}): LeaderboardRepository {
  return {
    computeLeaderboard: jest.fn(async () => []),
    computeChampionWinRates: jest.fn(async () => []),
    ...overrides,
  } as unknown as LeaderboardRepository;
}

describe('LeaderboardController', () => {
  describe('getLeaderboard', () => {
    it('defaults minGames to 1 when the query param is omitted', async () => {
      const repo = makeRepo();
      const controller = new LeaderboardController(repo);
      await controller.getLeaderboard(makeReq({}), makeRes());
      expect(repo.computeLeaderboard).toHaveBeenCalledWith(1);
    });

    it('parses an explicit minGames query param', async () => {
      const repo = makeRepo();
      const controller = new LeaderboardController(repo);
      await controller.getLeaderboard(makeReq({ minGames: '5' }), makeRes());
      expect(repo.computeLeaderboard).toHaveBeenCalledWith(5);
    });

    it('accepts minGames=0', async () => {
      const repo = makeRepo();
      const controller = new LeaderboardController(repo);
      await controller.getLeaderboard(makeReq({ minGames: '0' }), makeRes());
      expect(repo.computeLeaderboard).toHaveBeenCalledWith(0);
    });

    it('formats the computed entries via LeaderboardResponseView', async () => {
      const entry = new LeaderboardEntry('p1', 'Alice', 7, 3, 0, 10, 0.7);
      const repo = makeRepo({ computeLeaderboard: jest.fn(async () => [entry]) });
      const controller = new LeaderboardController(repo);
      const res = makeRes();

      await controller.getLeaderboard(makeReq({}), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([{ username: 'Alice', wins: 7, losses: 3, draws: 0, gamesPlayed: 10, winRate: 0.7 }]);
    });

    it('responds 400 when minGames is negative', async () => {
      const controller = new LeaderboardController(makeRepo());
      const res = makeRes();
      await controller.getLeaderboard(makeReq({ minGames: '-1' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('responds 400 when minGames is not an integer', async () => {
      const controller = new LeaderboardController(makeRepo());
      const res = makeRes();
      await controller.getLeaderboard(makeReq({ minGames: 'abc' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when minGames is not a string (e.g. a repeated query param parsed as an array)', async () => {
      const controller = new LeaderboardController(makeRepo());
      const res = makeRes();
      await controller.getLeaderboard(makeReq({ minGames: ['1', '2'] }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rethrows a non-ArenaError from the repository uncaught', async () => {
      const repo = makeRepo({
        computeLeaderboard: jest.fn(async () => {
          throw new Error('unexpected');
        }),
      });
      const controller = new LeaderboardController(repo);
      await expect(controller.getLeaderboard(makeReq({}), makeRes())).rejects.toThrow('unexpected');
    });
  });

  describe('getChampionWinRates', () => {
    it('delegates to LeaderboardRepository.computeChampionWinRates and returns the DTOs unmodified', async () => {
      const winRates = [{ championId: 'korr', gamesPlayed: 10, winRate: 0.5 }];
      const repo = makeRepo({ computeChampionWinRates: jest.fn(async () => winRates) });
      const controller = new LeaderboardController(repo);
      const res = makeRes();

      await controller.getChampionWinRates(makeReq({}), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(winRates);
    });

    it('rethrows a non-ArenaError from the repository uncaught', async () => {
      const repo = makeRepo({
        computeChampionWinRates: jest.fn(async () => {
          throw new Error('unexpected');
        }),
      });
      const controller = new LeaderboardController(repo);
      await expect(controller.getChampionWinRates(makeReq({}), makeRes())).rejects.toThrow('unexpected');
    });
  });

  describe('operation', () => {
    it('throws NotImplementedError — unused, Express routes call getLeaderboard/getChampionWinRates directly', () => {
      const controller = new LeaderboardController(makeRepo());
      expect(() => controller.operation('anything')).toThrow('not yet implemented');
    });
  });
});
```

---

### 5. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/api` passes; `npx jest LeaderboardResponseView
--coverage --collectCoverageFrom="src/view/LeaderboardResponseView.ts"` — validated result: **3 tests
passing, 100% statement/branch/function/line coverage**; `npx jest LeaderboardController --coverage
--collectCoverageFrom="src/controller/LeaderboardController.ts"` — validated result: **11 tests passing,
100% coverage**. Branch `api` from `main` (or reuse an already-checked-out `api` branch), commit `Step 10:
LeaderboardController and LeaderboardResponseView implementation and tests`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `getChampionWinRates` must NOT be routed through `LeaderboardResponseView` "for consistency"
with `getLeaderboard` — Design note 2 above explains why there is nothing for a view to format there.**
Adding one would just be an identity-mapping pass-through with no domain-to-DTO gap to close.
