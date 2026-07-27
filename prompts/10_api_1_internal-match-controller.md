# Prompt 10_api_1 — InternalMatchController + ErrorResponseView Implementation

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first. This
prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`packages/api`'s entire model package (`09_api_1` through `09_api_5`) must already be merged to `main` —
confirm via `git log` before starting. This prompt's controller depends directly on `PendingMatchCorrelator`
(`09_api_1`), `MatchRepository` (`09_api_4`), and `PlayerRepository` (`09_api_3`).

---

### Design note 1: not public-facing — a deployment concern, not something this class enforces
`InternalMatchController` is only ever called by `packages/server`'s `MatchReportingClient`, over the
deployment's private network (R7.1, R7.4). This course project does **not** implement network-level access
restriction (a firewall rule, an internal-only listener, a shared-secret header) inside this class — that is
documented as a deployment concern (whoever stands up the Railway/Docker deployment is responsible for
ensuring only `packages/server` can reach `/internal/*`), not implemented here. Nothing in the code below
assumes that protection exists; it validates every request body on its own merits regardless of caller.

### Design note 2: correction to the stub's `@throws` doc comments
The current stub documents `@throws {ValidationError}` on both `handleBegin`/`handleEnd`, implying the error
propagates out of the async method. Real implementation instead follows the controller-catches/view-shows
pattern `docs/01_class_list.md` §6b already establishes for `ChampionSelectController` ("catches ... from the
model and asks its view to emit an error payload"): both handlers catch any `ArenaError` — including
`PersistenceError` surfacing from `MatchRepository.recordMatch` or `PlayerRepository.findOrCreateByUsername`
— and format the response themselves via `ErrorResponseView`, rather than relying on Express 4 to catch a
rejected promise (which it does not, absent an `express-async-errors`-style wrapper this project doesn't
depend on). A non-`ArenaError` (a genuine bug) is rethrown uncaught, so it isn't silently swallowed as a 500.

### Design note 3: `ErrorResponseView`'s status mapping table
| Exception code | HTTP status | Why |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Malformed/missing request field — client error (3.6.2) |
| `PLAYER_NOT_FOUND` | 404 | Referenced player id doesn't resolve to a row |
| `PERSISTENCE_ERROR` | 500 | Underlying database failure — server error, not the caller's fault |
| *(anything else)* | 500 | An unmapped code reaching this view is itself a defect, not a client error |

### Design note 4: why `InternalMatchController` needs a `NULL_MODEL`/`NULL_VIEW` pair
`docs/01_class_list.md` §7b specifies `InternalMatchController extends AbstractController` with no
type arguments — same bare form as `PlayerIdentifyController` (`10_server_1`), because there is no domain
`Model` this REST controller observes and no push-based `View` to notify (a synchronous HTTP response has no
observer relationship to establish — `ErrorResponseView`/`MatchHistoryResponseView`/`LeaderboardResponseView`
are all explicitly documented as "a plain formatter, not a `View` implementer"). Unlike
`PlayerIdentifyController`, though, there is no existing process-wide Model/View instance in `packages/api`
(no equivalent of `packages/server`'s `MatchmakingQueue`) for `ApiMain` to hand in as a harmless stand-in.
Rather than making `ApiMain` construct three throwaway dummy objects, this prompt adds one small shared
helper, `packages/api/src/controller/nullMvc.ts`, that each of the three `10_api_*` REST controllers
(`InternalMatchController`, `MatchHistoryController` at `10_api_2`, `LeaderboardController` at `10_api_3`)
imports and passes to its own `super(...)` call. `10_api_2` and `10_api_3` depend on this prompt for that
file — do not duplicate it.

### Design note 5: CRITICAL — a real correctness gap found by implementing this for real, and the cross-track follow-up it requires
`schema.sql` gives `match_participants.player_id` a foreign key to `players(id)`. The already-merged
`PendingMatchCorrelator.BeginParticipant` (`09_api_1`) only carried `{playerId, team, championId}` —
`playerId` there is the **transient, client-generated session id** (R1.2's "the live match's id is only
stable within one browser session"), never a row `PlayerRepository` has created. If `handleEnd` had used
that id directly for `MatchParticipant.playerId`, **every single `recordMatch` call would fail its
foreign-key constraint** — not an edge case, but the persistence path's entire purpose (R7.1) failing every
time, for every match, forever. `PlayerRepository.findOrCreateByUsername`'s own doc comment already flags
this exact distinction ("Resolves by username, not by whatever transient client-generated PlayerId a live
match used ... Returns the canonical stored id") — it just had no caller yet.

**The fix, applied below:**
1. `PendingMatchCorrelator.BeginParticipant` (`09_api_1`, already merged) gains a `username: string` field —
   step 0 below.
2. `InternalMatchController` takes a new constructor dependency, `PlayerRepository`, and `handleEnd` calls
   `findOrCreateByUsername(p.username)` for each correlated participant, using the **returned canonical
   `player.id`** — not `p.playerId` — when constructing each `MatchParticipant` passed to
   `MatchRepository.recordMatch`.

**CRITICAL cross-track follow-up required, not done by this prompt:** `packages/shared/src/contract/dto.ts`'s
`MatchBeginReportDTO` (added by `prompts/10_server_6_connection-and-reporting.md`, Marshall's track — **not
yet executed** as of this writing, still just a prompt file) currently matches the *old*
`BeginParticipant` shape exactly (`{playerId, team, championId}`, no `username`). Before `10_server_6` is
executed, it must be updated to add `username: string` to `MatchBeginReportDTO['participants']`, and
`ConnectionHandler`/`MatchmakingController`'s match-creation flow (which already has each player's `Player`
object, including `username`, per `10_server_2`) must pass it through when `MatchReportingClient.
reportMatchBegin` is eventually wired to a call site (per `10_server_6`'s own "Note on scope," no call site
exists yet either). Flag this to whoever executes `10_server_6` — this is `packages/shared/src/contract`,
Marshall's territory (master context §2.3/§9.4), so `10_api_1` does not modify it directly, but the
mismatch must be resolved before the two tracks' real end-to-end flow can work.

---

### 0. Correction to `packages/api/src/model/PendingMatchCorrelator.ts` — add `username` to `BeginParticipant`

Change:
```ts
/** One participant's begin-time selections, as reported by `MatchReportingClient.reportMatchBegin`. */
export interface BeginParticipant {
  playerId: PlayerId;
  team: Team;
  championId: ChampionId;
}
```
to:
```ts
/**
 * One participant's begin-time selections, as reported by `MatchReportingClient.reportMatchBegin`.
 *
 * CORRECTION (Step 10, `10_api_1`): added `username`. `InternalMatchController.handleEnd` (`10_api_1`)
 * must resolve each participant's *canonical* `players.id` via `PlayerRepository.findOrCreateByUsername`
 * before persisting — `match_participants.player_id` has a foreign key to `players(id)` (`schema.sql`), and
 * `playerId` here is the transient, client-generated session id (R1.2), never a row `PlayerRepository` has
 * created. Without a username, `InternalMatchController` would have no way to resolve or create that row,
 * and every `recordMatch` call would fail its foreign-key constraint. **This requires a matching
 * correction to `packages/shared/src/contract/dto.ts`'s `MatchBeginReportDTO` and to
 * `prompts/10_server_6_connection-and-reporting.md`'s `MatchReportingClient`/`ConnectionHandler`** (not yet
 * executed at the time this correction was made) — see `10_api_1`'s design note 5 for the full flag.
 */
export interface BeginParticipant {
  playerId: PlayerId;
  username: string;
  team: Team;
  championId: ChampionId;
}
```

And in `packages/api/src/model/PendingMatchCorrelator.test.ts`, add `username` to the existing
`makeParticipants()` fixture and the inline `retried` fixture (purely additive — `PendingMatchCorrelator`
treats participants as opaque data, so no other test logic changes):
```ts
function makeParticipants(): BeginParticipant[] {
  return [
    { playerId: 'player-1', username: 'Alice', team: Team.A, championId: 'korr' },
    { playerId: 'player-2', username: 'Bob', team: Team.B, championId: 'vex' },
  ];
}
```
```ts
    const retried: BeginParticipant[] = [{ playerId: 'someone-else', username: 'Someone', team: Team.A, championId: 'rin' }];
```

### 1. Create `packages/api/src/controller/nullMvc.ts` with:

```ts
import type { Model, View, Controller } from '@arena/shared';

/**
 * Harmless stand-in `Model`/`View` pair for `packages/api`'s REST controllers, which — unlike
 * `packages/server`'s socket controllers — have no domain `Model` to observe and no push-based `View` to
 * notify (response formatting is synchronous, one HTTP response per request). `AbstractController`
 * structurally requires a `model`/`view` in its constructor; this pair satisfies that requirement without
 * inventing a fake domain object. Mirrors `PlayerIdentifyController`'s "default (untyped) AbstractController
 * generics" design note (`prompts/10_server_1_player-identify-controller.md`), except here there is no
 * existing process-wide Model/View instance (like `MatchmakingQueue`) for `ApiMain` to reuse as the
 * stand-in, so each api controller supplies this no-op pair itself rather than requiring callers to
 * construct one.
 */
export const NULL_MODEL: Model = {
  notifyChanged: () => {},
};

export const NULL_VIEW: View = {
  getModel: () => NULL_MODEL,
  setModel: () => {},
  getController: () => undefined as unknown as Controller,
  setController: () => {},
};
```

### 2. Replace `packages/api/src/view/ErrorResponseView.ts` with:

```ts
import { ArenaError } from '@arena/shared';

/**
 * Formats a caught `ArenaError` into an HTTP status code and JSON error body. A plain formatter, not a
 * `View` implementer — a synchronous HTTP response has no push/observe relationship to establish.
 */
export class ErrorResponseView {
  /**
   * Maps a domain exception's `code` to an HTTP status. Codes not listed here (exceptions that can only
   * originate in `packages/server`'s socket-side validation, never thrown by anything `packages/api`
   * calls) fall back to 500 — an unmapped code reaching this view is itself a defect, not a client error.
   */
  private static readonly STATUS_BY_CODE: Record<string, number> = {
    VALIDATION_ERROR: 400,
    PLAYER_NOT_FOUND: 404,
    PERSISTENCE_ERROR: 500,
  };

  /**
   * @param error - the domain exception caught while handling a request
   * @returns the HTTP status and JSON body to send in response
   */
  render(error: ArenaError): { status: number; body: { code: string; message: string } } {
    const status = ErrorResponseView.STATUS_BY_CODE[error.code] ?? 500;
    return { status, body: { code: error.code, message: error.message } };
  }
}
```

### 3. Create `packages/api/src/view/ErrorResponseView.test.ts` with:

```ts
import { ArenaError, ValidationError, PlayerNotFoundError, PersistenceError } from '@arena/shared';
import { ErrorResponseView } from './ErrorResponseView';

class UnmappedError extends ArenaError {
  readonly code = 'SOME_UNMAPPED_CODE';
  constructor() {
    super('an error type this view has no explicit mapping for');
  }
}

describe('ErrorResponseView', () => {
  describe('render', () => {
    it('maps ValidationError to 400', () => {
      const view = new ErrorResponseView();
      const { status, body } = view.render(new ValidationError('matchId', 'must be a non-empty string'));
      expect(status).toBe(400);
      expect(body).toEqual({ code: 'VALIDATION_ERROR', message: 'Invalid matchId: must be a non-empty string' });
    });

    it('maps PlayerNotFoundError to 404', () => {
      const view = new ErrorResponseView();
      const { status, body } = view.render(new PlayerNotFoundError('p1'));
      expect(status).toBe(404);
      expect(body.code).toBe('PLAYER_NOT_FOUND');
    });

    it('maps PersistenceError to 500', () => {
      const view = new ErrorResponseView();
      const { status, body } = view.render(new PersistenceError('recordMatch'));
      expect(status).toBe(500);
      expect(body.code).toBe('PERSISTENCE_ERROR');
    });

    it('falls back to 500 for a code with no explicit mapping', () => {
      const view = new ErrorResponseView();
      const { status, body } = view.render(new UnmappedError());
      expect(status).toBe(500);
      expect(body.code).toBe('SOME_UNMAPPED_CODE');
    });
  });
});
```

### 4. Replace `packages/api/src/controller/InternalMatchController.ts` with:

```ts
import {
  AbstractController,
  NotImplementedError,
  ArenaError,
  ValidationError,
  Team,
  EndReason,
  MatchResult,
  Match,
  MatchParticipant,
  MatchId,
  PlayerId,
  ChampionId,
} from '@arena/shared';
import type { Request, Response } from 'express';
import { PendingMatchCorrelator, BeginParticipant, MatchOutcome } from '../model/PendingMatchCorrelator';
import { MatchRepository } from '../model/MatchRepository';
import { PlayerRepository } from '../model/PlayerRepository';
import { ErrorResponseView } from '../view/ErrorResponseView';
import { NULL_MODEL, NULL_VIEW } from './nullMvc';

/**
 * `POST /internal/matches/begin` and `/end` — not public-facing; only the server package's
 * `MatchReportingClient` calls these, over the deployment's private network (R7.1, R7.4). Correlates the
 * two-part report via `PendingMatchCorrelator` before persisting through `MatchRepository`.
 *
 * DEPLOYMENT NOTE (R-D4/R-D7 Portability): "private network" here is a deployment concern, not something
 * enforced in this class. This course project does not implement network-level access restriction (a
 * firewall rule, an internal-only listener, a shared secret header) — whoever deploys this container is
 * responsible for ensuring only `packages/server` can reach these routes (e.g. a Railway private network,
 * or binding this route group to a non-public interface). Nothing below assumes that protection exists.
 *
 * CORRECTION (Step 10): the original stub documented `@throws {ValidationError}` on both handlers, implying
 * the error would propagate out of the async method. Real implementation instead follows the
 * controller-catches/view-shows pattern `ChampionSelectController` already established
 * (`docs/01_class_list.md` §6b) rather than relying on Express 4 to catch a rejected promise (which it does
 * not, without an `express-async-errors`-style wrapper this project doesn't depend on): both handlers catch
 * any `ArenaError` (including `PersistenceError` from `MatchRepository`) and format the response themselves
 * via `ErrorResponseView`, never letting it reach Express's default error handler.
 *
 * CRITICAL CORRECTION (Step 10): `handleEnd` resolves each participant's *canonical* `players.id` via
 * `PlayerRepository.findOrCreateByUsername` before calling `MatchRepository.recordMatch`. Without this,
 * `MatchParticipant.playerId` would carry the transient, client-generated session id (`BeginParticipant.
 * playerId`, R1.2) — which is never a row `PlayerRepository` has created — straight into
 * `match_participants.player_id`, which has a foreign key to `players(id)` (`schema.sql`). Every single
 * `recordMatch` call would then fail its foreign-key constraint, meaning **no match could ever be recorded
 * successfully** — this is not an edge case, it is the persistence path's core purpose (R7.1) failing
 * every time. See `PendingMatchCorrelator.BeginParticipant`'s own correction note for the matching
 * `username` field addition this depends on, and this prompt's design note 5 for the required follow-up
 * correction to `packages/shared/src/contract/dto.ts` and `10_server_6`.
 */
export class InternalMatchController extends AbstractController {
  constructor(
    private readonly correlator: PendingMatchCorrelator,
    private readonly matchRepository: MatchRepository,
    private readonly playerRepository: PlayerRepository,
    private readonly errorView: ErrorResponseView = new ErrorResponseView(),
  ) {
    super(NULL_MODEL, NULL_VIEW);
  }

  /**
   * Handles the match-start half of a report. Validates the body, then records it via
   * `PendingMatchCorrelator.recordBegin` — this alone never persists anything (persistence only happens once
   * `handleEnd` supplies the other half).
   * @param req - Express request carrying
   *   `{ matchId, participants: [{playerId, username, team, championId}, {...}] }`
   * @param res - Express response, written to directly rather than returned
   */
  async handleBegin(req: Request, res: Response): Promise<void> {
    try {
      const { matchId, participants } = this.parseBeginBody(req.body);
      this.correlator.recordBegin(matchId, participants);
      res.status(200).json({ acknowledged: true });
    } catch (err) {
      this.respondError(err, res);
    }
  }

  /**
   * Handles the match-end half of a report; once both halves of a matchId are present (per
   * `PendingMatchCorrelator.recordEnd`'s return), persists the completed match via
   * `MatchRepository.recordMatch`. Each participant's per-match `MatchResult` is derived here from the
   * outcome's `winningTeam`, since neither half of the report carries a per-player result directly. Each
   * participant's canonical `playerId` is resolved via `PlayerRepository.findOrCreateByUsername` — see the
   * CRITICAL CORRECTION in this class's doc comment for why the transient session id alone is not enough.
   * @param req - Express request carrying `{ matchId, endReason, winningTeam, durationMs, endedAt }`
   *   (`endedAt` an ISO-8601 string over the wire)
   * @param res - Express response, written to directly rather than returned
   */
  async handleEnd(req: Request, res: Response): Promise<void> {
    try {
      const { matchId, outcome } = this.parseEndBody(req.body);
      const correlated = this.correlator.recordEnd(matchId, outcome);
      if (correlated) {
        const match = new Match(matchId, outcome.endReason, outcome.winningTeam, outcome.durationMs, outcome.endedAt);
        const participants: MatchParticipant[] = [];
        for (const p of correlated.participants) {
          const player = await this.playerRepository.findOrCreateByUsername(p.username);
          participants.push(
            new MatchParticipant(matchId, player.id, p.team, p.championId, this.resultFor(p.team, outcome.winningTeam)),
          );
        }
        await this.matchRepository.recordMatch(match, participants);
      }
      res.status(200).json({ acknowledged: true });
    } catch (err) {
      this.respondError(err, res);
    }
  }

  private resultFor(team: Team, winningTeam: Team | null): MatchResult {
    if (winningTeam === null) return MatchResult.DRAW;
    return team === winningTeam ? MatchResult.WIN : MatchResult.LOSS;
  }

  private respondError(err: unknown, res: Response): void {
    if (err instanceof ArenaError) {
      const { status, body } = this.errorView.render(err);
      res.status(status).json(body);
      return;
    }
    throw err;
  }

  private parseBeginBody(body: unknown): { matchId: MatchId; participants: BeginParticipant[] } {
    const b = (body ?? {}) as Record<string, unknown>;
    const matchId = b.matchId;
    if (typeof matchId !== 'string' || matchId.length === 0) {
      throw new ValidationError('matchId', 'must be a non-empty string');
    }
    const rawParticipants = b.participants;
    if (!Array.isArray(rawParticipants) || rawParticipants.length !== 2) {
      throw new ValidationError('participants', 'must be an array of exactly two entries');
    }
    const participants = rawParticipants.map((p, i) => this.parseParticipant(p, i));
    return { matchId, participants };
  }

  private parseParticipant(raw: unknown, index: number): BeginParticipant {
    const p = (raw ?? {}) as Record<string, unknown>;
    const playerId = p.playerId;
    if (typeof playerId !== 'string' || playerId.length === 0) {
      throw new ValidationError(`participants[${index}].playerId`, 'must be a non-empty string');
    }
    const username = p.username;
    if (typeof username !== 'string' || username.length === 0) {
      throw new ValidationError(`participants[${index}].username`, 'must be a non-empty string');
    }
    if (p.team !== Team.A && p.team !== Team.B) {
      throw new ValidationError(`participants[${index}].team`, 'must be "A" or "B"');
    }
    const championId = p.championId;
    if (typeof championId !== 'string' || championId.length === 0) {
      throw new ValidationError(`participants[${index}].championId`, 'must be a non-empty string');
    }
    return { playerId: playerId as PlayerId, username, team: p.team, championId: championId as ChampionId };
  }

  private parseEndBody(body: unknown): { matchId: MatchId; outcome: MatchOutcome } {
    const b = (body ?? {}) as Record<string, unknown>;
    const matchId = b.matchId;
    if (typeof matchId !== 'string' || matchId.length === 0) {
      throw new ValidationError('matchId', 'must be a non-empty string');
    }
    const endReason = b.endReason;
    if (!Object.values(EndReason).includes(endReason as EndReason)) {
      throw new ValidationError('endReason', 'must be a valid EndReason');
    }
    const winningTeam = b.winningTeam;
    if (winningTeam !== null && winningTeam !== Team.A && winningTeam !== Team.B) {
      throw new ValidationError('winningTeam', 'must be "A", "B", or null');
    }
    const durationMs = b.durationMs;
    if (typeof durationMs !== 'number' || durationMs < 0) {
      throw new ValidationError('durationMs', 'must be a non-negative number');
    }
    const endedAtRaw = b.endedAt;
    const endedAt = typeof endedAtRaw === 'string' ? new Date(endedAtRaw) : null;
    if (!endedAt || Number.isNaN(endedAt.getTime())) {
      throw new ValidationError('endedAt', 'must be an ISO-8601 timestamp string');
    }
    return {
      matchId,
      outcome: { endReason: endReason as EndReason, winningTeam: winningTeam as Team | null, durationMs, endedAt },
    };
  }

  /**
   * Satisfies the `AbstractController` contract; unused in this controller's own request path, since
   * Express routes call `handleBegin`/`handleEnd` directly rather than dispatching through `operation`.
   * @param action - unused
   * @param payload - unused
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('InternalMatchController.operation not yet implemented');
  }
}
```

### 5. Create `packages/api/src/controller/InternalMatchController.test.ts` with:

```ts
import { Team, EndReason, MatchResult, PersistenceError, Player } from '@arena/shared';
import type { Request, Response } from 'express';
import { InternalMatchController } from './InternalMatchController';
import { PendingMatchCorrelator, CorrelatedMatchReport } from '../model/PendingMatchCorrelator';
import { MatchRepository } from '../model/MatchRepository';
import { PlayerRepository } from '../model/PlayerRepository';

function makeRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeReq(body: unknown): Request {
  return { body } as Request;
}

function makeCorrelator(overrides: Partial<PendingMatchCorrelator> = {}): PendingMatchCorrelator {
  return {
    recordBegin: jest.fn(),
    recordEnd: jest.fn(() => null),
    ...overrides,
  } as unknown as PendingMatchCorrelator;
}

function makeRepo(overrides: Partial<MatchRepository> = {}): MatchRepository {
  return {
    recordMatch: jest.fn(),
    findHistoryForPlayer: jest.fn(),
    ...overrides,
  } as unknown as MatchRepository;
}

function makePlayerRepo(overrides: Partial<PlayerRepository> = {}): PlayerRepository {
  return {
    findOrCreateByUsername: jest.fn(async (username: string) => new Player(`canonical-${username}`, username, new Date())),
    ...overrides,
  } as unknown as PlayerRepository;
}

const VALID_BEGIN_BODY = {
  matchId: 'match-1',
  participants: [
    { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
    { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
  ],
};

const VALID_END_BODY = {
  matchId: 'match-1',
  endReason: EndReason.ELIMINATION,
  winningTeam: Team.A,
  durationMs: 90_000,
  endedAt: '2026-01-01T00:00:00.000Z',
};

describe('InternalMatchController', () => {
  describe('handleBegin', () => {
    it('parses a valid body and delegates to PendingMatchCorrelator.recordBegin', async () => {
      const correlator = makeCorrelator();
      const controller = new InternalMatchController(correlator, makeRepo(), makePlayerRepo());
      const res = makeRes();

      await controller.handleBegin(makeReq(VALID_BEGIN_BODY), res);

      expect(correlator.recordBegin).toHaveBeenCalledWith('match-1', [
        { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
        { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
      ]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ acknowledged: true });
    });

    it('responds 400 when matchId is missing', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleBegin(makeReq({ participants: VALID_BEGIN_BODY.participants }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('responds 400 when participants is not an array of exactly two', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleBegin(makeReq({ matchId: 'm1', participants: [VALID_BEGIN_BODY.participants[0]] }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant has a missing playerId', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const body = {
        matchId: 'm1',
        participants: [{ username: 'Alice', team: Team.A, championId: 'korr' }, VALID_BEGIN_BODY.participants[1]],
      };
      await controller.handleBegin(makeReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant has a missing username', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const body = {
        matchId: 'm1',
        participants: [{ playerId: 'session-p1', team: Team.A, championId: 'korr' }, VALID_BEGIN_BODY.participants[1]],
      };
      await controller.handleBegin(makeReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant has an invalid team', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const body = {
        matchId: 'm1',
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: 'C', championId: 'korr' },
          VALID_BEGIN_BODY.participants[1],
        ],
      };
      await controller.handleBegin(makeReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant has a missing championId', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const body = {
        matchId: 'm1',
        participants: [{ playerId: 'session-p1', username: 'Alice', team: Team.A }, VALID_BEGIN_BODY.participants[1]],
      };
      await controller.handleBegin(makeReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when the request body is entirely missing', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleBegin(makeReq(undefined), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant entry itself is null', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleBegin(makeReq({ matchId: 'm1', participants: [null, VALID_BEGIN_BODY.participants[1]] }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rethrows a non-ArenaError from the correlator uncaught', async () => {
      const correlator = makeCorrelator({
        recordBegin: jest.fn(() => {
          throw new Error('unexpected');
        }),
      });
      const controller = new InternalMatchController(correlator, makeRepo(), makePlayerRepo());
      await expect(controller.handleBegin(makeReq(VALID_BEGIN_BODY), makeRes())).rejects.toThrow('unexpected');
    });
  });

  describe('handleEnd', () => {
    it('acknowledges without persisting when only one half of the report is present', async () => {
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => null) });
      const repo = makeRepo();
      const playerRepo = makePlayerRepo();
      const controller = new InternalMatchController(correlator, repo, playerRepo);
      const res = makeRes();

      await controller.handleEnd(makeReq(VALID_END_BODY), res);

      expect(correlator.recordEnd).toHaveBeenCalled();
      expect(playerRepo.findOrCreateByUsername).not.toHaveBeenCalled();
      expect(repo.recordMatch).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ acknowledged: true });
    });

    it('resolves each participant to their canonical player id before persisting, deriving WIN/LOSS per participant', async () => {
      const correlated: CorrelatedMatchReport = {
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
          { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
        ],
        outcome: {
          endReason: EndReason.ELIMINATION,
          winningTeam: Team.A,
          durationMs: 90_000,
          endedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      };
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => correlated) });
      const repo = makeRepo();
      const playerRepo = makePlayerRepo();
      const controller = new InternalMatchController(correlator, repo, playerRepo);

      await controller.handleEnd(makeReq(VALID_END_BODY), makeRes());

      expect(playerRepo.findOrCreateByUsername).toHaveBeenCalledWith('Alice');
      expect(playerRepo.findOrCreateByUsername).toHaveBeenCalledWith('Bob');

      expect(repo.recordMatch).toHaveBeenCalledTimes(1);
      const [match, participants] = (repo.recordMatch as jest.Mock).mock.calls[0];
      expect(match.id).toBe('match-1');
      expect(match.winningTeam).toBe(Team.A);
      expect(participants).toHaveLength(2);
      // canonical ids come from PlayerRepository, NOT the transient session playerId.
      expect(participants[0]).toMatchObject({ playerId: 'canonical-Alice', result: MatchResult.WIN });
      expect(participants[1]).toMatchObject({ playerId: 'canonical-Bob', result: MatchResult.LOSS });
    });

    it('derives DRAW for both participants when winningTeam is null', async () => {
      const correlated: CorrelatedMatchReport = {
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
          { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
        ],
        outcome: {
          endReason: EndReason.TIME_LIMIT,
          winningTeam: null,
          durationMs: 300_000,
          endedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      };
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => correlated) });
      const repo = makeRepo();
      const controller = new InternalMatchController(correlator, repo, makePlayerRepo());

      await controller.handleEnd(makeReq({ ...VALID_END_BODY, winningTeam: null, endReason: EndReason.TIME_LIMIT }), makeRes());

      const [, participants] = (repo.recordMatch as jest.Mock).mock.calls[0];
      expect(participants[0].result).toBe(MatchResult.DRAW);
      expect(participants[1].result).toBe(MatchResult.DRAW);
    });

    it('responds 400 when endReason is invalid', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq({ ...VALID_END_BODY, endReason: 'NOT_REAL' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when winningTeam is neither A, B, nor null', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq({ ...VALID_END_BODY, winningTeam: 'C' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when durationMs is negative', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq({ ...VALID_END_BODY, durationMs: -1 }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when endedAt is not a valid ISO timestamp', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq({ ...VALID_END_BODY, endedAt: 'not-a-date' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when matchId is missing', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const { matchId, ...rest } = VALID_END_BODY;
      await controller.handleEnd(makeReq(rest), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when the request body is entirely missing', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq(undefined), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when endedAt is missing entirely (not just malformed)', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const { endedAt, ...rest } = VALID_END_BODY;
      await controller.handleEnd(makeReq(rest), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('formats a PersistenceError from MatchRepository.recordMatch as a 500 via ErrorResponseView', async () => {
      const correlated: CorrelatedMatchReport = {
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
          { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
        ],
        outcome: {
          endReason: EndReason.ELIMINATION,
          winningTeam: Team.A,
          durationMs: 90_000,
          endedAt: new Date(),
        },
      };
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => correlated) });
      const repo = makeRepo({
        recordMatch: jest.fn(() => {
          throw new PersistenceError('recordMatch');
        }),
      });
      const controller = new InternalMatchController(correlator, repo, makePlayerRepo());
      const res = makeRes();

      await controller.handleEnd(makeReq(VALID_END_BODY), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PERSISTENCE_ERROR' }));
    });

    it('formats a PersistenceError from PlayerRepository.findOrCreateByUsername as a 500 via ErrorResponseView', async () => {
      const correlated: CorrelatedMatchReport = {
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
          { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
        ],
        outcome: {
          endReason: EndReason.ELIMINATION,
          winningTeam: Team.A,
          durationMs: 90_000,
          endedAt: new Date(),
        },
      };
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => correlated) });
      const playerRepo = makePlayerRepo({
        findOrCreateByUsername: jest.fn(async () => {
          throw new PersistenceError('findOrCreateByUsername');
        }),
      });
      const controller = new InternalMatchController(correlator, makeRepo(), playerRepo);
      const res = makeRes();

      await controller.handleEnd(makeReq(VALID_END_BODY), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PERSISTENCE_ERROR' }));
    });
  });

  describe('operation', () => {
    it('throws NotImplementedError — unused, Express routes call handleBegin/handleEnd directly', () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      expect(() => controller.operation('anything')).toThrow('not yet implemented');
    });
  });
});
```

---

### 6. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/api` passes; `npx jest PendingMatchCorrelator
--coverage --collectCoverageFrom="src/model/PendingMatchCorrelator.ts"` (re-run after step 0's correction) —
validated result: **7 tests passing, 100% coverage, unchanged behavior**; `npx jest ErrorResponseView
--coverage --collectCoverageFrom="src/view/ErrorResponseView.ts"` — validated result: **4 tests passing,
100% statement/branch/function/line coverage**; `npx jest InternalMatchController --coverage
--collectCoverageFrom="src/controller/InternalMatchController.ts"` — validated result: **23 tests passing,
100% statement/branch/function/line coverage**, including the two `PersistenceError`-propagation cases (one
from `MatchRepository`, one from `PlayerRepository`) and the canonical-id-resolution CRITICAL CORRECTION
test. Also re-run the full `packages/api` suite once (`npx jest`) to confirm no regressions — validated
result: **7 suites, 50 tests, all passing**. Branch `api` from `main` (or reuse an already-checked-out `api`
branch), commit `Step 10: InternalMatchController and ErrorResponseView implementation and tests,
BeginParticipant username correction`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `10_api_2` and `10_api_3` both import `NULL_MODEL`/`NULL_VIEW` from
`packages/api/src/controller/nullMvc.ts` created in step 1 above — do not recreate a second copy of this
helper when executing those prompts.** Also do not add real network-level access restriction to
`InternalMatchController` "while you're in there" — Design note 1 above deliberately documents that as an
out-of-scope deployment concern for this course project. **Most importantly: before executing
`prompts/10_server_6_connection-and-reporting.md`, apply the cross-track follow-up from design note 5**
(add `username: string` to `MatchBeginReportDTO['participants']` in `packages/shared/src/contract/dto.ts`,
and thread each player's `username` through wherever that prompt eventually wires a
`reportMatchBegin` call site) — without it, `InternalMatchController.handleEnd` has no way to resolve a
canonical player id and every real match report will fail to persist.
