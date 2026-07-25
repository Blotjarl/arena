import { MatchId, NotImplementedError } from '@arena/shared';
import { MatchModel } from './MatchModel';

/**
 * The server's single authoritative simulation driver: ticks every registered MatchModel at a fixed
 * rate (R-P1, 20Hz by default) and isolates each match's failures from every other (R5.4, 3.6.2). One
 * process-wide instance, aggregating (not owning the lifecycle of) the matches it drives — a match is
 * created by MatchmakingController and merely registered here.
 */
export class TickLoop {
  private matches: Map<MatchId, MatchModel> = new Map();
  private handle: NodeJS.Timeout | null = null;

  constructor(
    /** Ticks per second; defaults to 20 per R-P1. */
    private readonly tickRateHz: number = 20,
  ) {}

  /**
   * Adds a match to the set driven by this loop's ticking.
   * @param match - the match to start ticking; keyed by its own id
   */
  register(match: MatchModel): void {
    this.matches.set(match.id, match);
  }

  /**
   * Removes a match from the ticking set, e.g. once it has ended.
   * @param matchId - the match to stop ticking
   */
  unregister(matchId: MatchId): void {
    this.matches.delete(matchId);
  }

  /** Starts the fixed-rate timer that invokes onTick(); a no-op if already running. */
  start(): void {
    throw new NotImplementedError('TickLoop.start not yet implemented');
  }

  /** Stops the fixed-rate timer; a no-op if not running. */
  stop(): void {
    throw new NotImplementedError('TickLoop.stop not yet implemented');
  }

  /**
   * CRITICAL CHECKPOINT (prompts/00_master_context.md §8): iterates every registered match and calls its
   * tick() inside a try/catch scoped to that match alone, so one match's internal error is logged and
   * skipped rather than propagating — it must never crash the loop or affect any other in-progress match
   * (R5.4, 3.6.2). This per-match isolation requirement is what the isolated Jest test (driving tick()
   * directly, with no timers/sockets — 00_master_context.md §8) exists to verify. The stub below
   * intentionally does not yet demonstrate this — Step 8 implementation must add it.
   */
  private onTick(): void {
    throw new NotImplementedError('TickLoop.onTick not yet implemented');
  }
}
