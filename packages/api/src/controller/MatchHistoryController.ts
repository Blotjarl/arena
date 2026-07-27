import { AbstractController, NotImplementedError, ArenaError, ValidationError, PlayerId } from '@arena/shared';
import type { Request, Response } from 'express';
import { MatchRepository } from '../model/MatchRepository';
import { MatchHistoryResponseView } from '../view/MatchHistoryResponseView';
import { ErrorResponseView } from '../view/ErrorResponseView';
import { NULL_MODEL, NULL_VIEW } from './nullMvc';

/**
 * `GET /players/:id/matches?page=&pageSize=` — serves a player's paginated match history (R7.3).
 *
 * Uses the default (untyped) `AbstractController` generics via the shared `NULL_MODEL`/`NULL_VIEW`
 * stand-in — see `10_api_1`'s design note 4 for why: no domain `Model` this REST controller observes, and
 * `MatchHistoryResponseView` is a plain formatter, not a push-based `View`.
 */
export class MatchHistoryController extends AbstractController {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly responseView: MatchHistoryResponseView = new MatchHistoryResponseView(),
    private readonly errorView: ErrorResponseView = new ErrorResponseView(),
  ) {
    super(NULL_MODEL, NULL_VIEW);
  }

  /**
   * Fetches a page of match history via `MatchRepository.findHistoryForPlayer` and formats it through
   * `MatchHistoryResponseView`. Catches any `ArenaError` and formats it via `ErrorResponseView` instead of
   * letting it propagate — same controller-catches/view-shows pattern as `InternalMatchController`
   * (`10_api_1`).
   * @param req - Express request carrying the player id and pagination params
   * @param res - Express response, written to directly rather than returned
   */
  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const playerId = req.params.id as PlayerId;
      const { page, pageSize } = this.parsePagination(req.query.page, req.query.pageSize);
      const rows = await this.matchRepository.findHistoryForPlayer(playerId, page, pageSize);
      res.status(200).json(this.responseView.render(rows));
    } catch (err) {
      this.respondError(err, res);
    }
  }

  private parsePagination(rawPage: unknown, rawPageSize: unknown): { page: number; pageSize: number } {
    const page = this.parsePositiveInt(rawPage, 'page');
    const pageSize = this.parsePositiveInt(rawPageSize, 'pageSize');
    return { page, pageSize };
  }

  private parsePositiveInt(raw: unknown, field: string): number {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new ValidationError(field, 'must be provided');
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new ValidationError(field, 'must be a positive integer');
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
   * Satisfies the `AbstractController` contract; unused in this controller's own request path, since the
   * Express route calls `getHistory` directly rather than dispatching through `operation`.
   * @param action - unused
   * @param payload - unused
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchHistoryController.operation not yet implemented');
  }
}
