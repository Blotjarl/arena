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
