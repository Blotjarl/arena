import { AbstractModel, ModelEvent, LeaderboardEntryDTO, ChampionWinRateDTO } from '@arena/shared';

/**
 * Tracks the leaderboard data fetched from the api's REST endpoints (SRS 3.2.8, R8.1-R8.3). Unlike
 * every other client model, nothing here is server-*pushed* over Socket.IO — LeaderboardController
 * (11_client_7) populates this model from a plain HTTP `fetch`, the client's first direct REST consumer.
 * The server/api is still the sole source of truth for the data itself (master context §1.1); this model
 * only stores what the last successful fetch returned.
 */
export class ClientLeaderboardModel extends AbstractModel {
  /** Ranked leaderboard rows from the last successful fetch; null until the first one completes. */
  public entries: LeaderboardEntryDTO[] | null = null;

  /** Per-champion win rates from the last successful fetch; null until the first one completes. */
  public championWinRates: ChampionWinRateDTO[] | null = null;

  /** True while a fetch is in flight. */
  public loading = false;

  /** The most recent fetch failure's message, or null if the last attempt (if any) succeeded. */
  public error: string | null = null;

  /** Records that a fetch has started — clears any previous error, so a retry doesn't show stale failure text. */
  setLoading(): void {
    this.loading = true;
    this.error = null;
    this.notifyChanged(new ModelEvent(this, 'leaderboard:loading', null));
  }

  /**
   * Records a successful fetch. Stored exactly as given — same references, no re-sorting or alteration
   * (the api already ranks `entries` by win rate; this model doesn't second-guess that).
   * @param entries - the ranked leaderboard rows
   * @param championWinRates - the per-champion win-rate summary
   */
  setLoaded(entries: LeaderboardEntryDTO[], championWinRates: ChampionWinRateDTO[]): void {
    this.entries = entries;
    this.championWinRates = championWinRates;
    this.loading = false;
    this.error = null;
    this.notifyChanged(new ModelEvent(this, 'leaderboard:loaded', { entries, championWinRates }));
  }

  /**
   * Records a failed fetch. Deliberately leaves any previously-loaded `entries`/`championWinRates` in
   * place — a failed *refresh* of an already-populated screen shouldn't blank out data the player was
   * already looking at, only surface that the refresh itself didn't work.
   * @param message - a human-readable description of what went wrong
   */
  setError(message: string): void {
    this.loading = false;
    this.error = message;
    this.notifyChanged(new ModelEvent(this, 'leaderboard:error', message));
  }
}
