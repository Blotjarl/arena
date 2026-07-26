import { MatchId } from '@arena/shared';
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
    if (this.handle !== null) return;
    this.handle = setInterval(() => this.onTick(), 1000 / this.tickRateHz);
  }

  /** Stops the fixed-rate timer; a no-op if not running. */
  stop(): void {
    if (this.handle === null) return;
    clearInterval(this.handle);
    this.handle = null;
  }

  /**
   * CRITICAL CHECKPOINT (prompts/00_master_context.md §8): iterates every registered match and calls its
   * tick() inside a try/catch scoped to that match alone, so one match's internal error is logged and
   * skipped rather than propagating — it must never crash the loop or affect any other in-progress match
   * (R5.4, 3.6.2). deltaSeconds is the fixed nominal tick interval (1 / tickRateHz), not a measured
   * wall-clock delta — Node's setInterval isn't perfectly precise, and a fixed simulation step is more
   * deterministic (and more testable) than trusting measured jitter.
   */
  private onTick(): void {
    const deltaSeconds = 1 / this.tickRateHz;
    for (const [matchId, match] of this.matches) {
      try {
        match.tick(deltaSeconds);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`TickLoop: match ${matchId} threw during tick(), isolated from other matches:`, err);
      }
    }
  }
}
