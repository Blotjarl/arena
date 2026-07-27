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
