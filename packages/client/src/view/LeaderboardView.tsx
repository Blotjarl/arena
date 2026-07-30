import { useEffect, useReducer } from 'react';
import { View, ModelListener, ModelEvent, ChampionRoster } from '@arena/shared';
import { ClientLeaderboardModel } from '../model/ClientLeaderboardModel';
import { LeaderboardController } from '../controller/LeaderboardController';

/**
 * MVC View for the Leaderboard screen (SRS 3.2.8, R8.1-R8.3). Not one of SRS 3.1.1's four formally-listed
 * screens — see `prompts/11_client_7_leaderboard-screen.md`'s own CRITICAL section for why: 3.1.1 never
 * actually lists a Leaderboard screen even though Scope (1.3) and Product Functions (2.2) both describe
 * the client as letting a player "view a leaderboard". `AppRouter` (`ClientMain.tsx`) owns whether this
 * screen is currently shown, via a plain `showLeaderboard` toggle checked ahead of the normal four-way
 * phase routing — this view has no opinion on its own visibility.
 */
export class LeaderboardView implements View, ModelListener {
  /** Callback registered by LeaderboardScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  constructor(
    private model: ClientLeaderboardModel,
    private controller: LeaderboardController,
  ) {
    this.model.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * @param callback - called with no arguments whenever the model changes
   */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Returns the observed leaderboard model.
   * @returns the current ClientLeaderboardModel
   */
  getModel(): ClientLeaderboardModel {
    return this.model;
  }

  /**
   * Replaces the observed model reference. Unlike the constructor, this does not re-register the
   * view as a listener on the new model — call `model.addModelListener(this)` separately if needed.
   * @param model - the new ClientLeaderboardModel to observe
   */
  setModel(model: ClientLeaderboardModel): void {
    this.model = model;
  }

  /**
   * Returns the controller used to dispatch the refresh action.
   * @returns the current LeaderboardController
   */
  getController(): LeaderboardController {
    return this.controller;
  }

  /**
   * Replaces the controller used to dispatch actions.
   * @param controller - the new LeaderboardController
   */
  setController(controller: LeaderboardController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when the leaderboard model fires a change event (loading/loaded/error).
   * Invokes the registered onUpdate callback to trigger a React re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    this.onUpdate?.();
  }
}

/**
 * Player ranking table and per-champion win-rate summary (SRS 3.2.8, R8.1-R8.3).
 *
 * CRITICAL (master context §1.1): this screen never computes rankings or win rates itself — `entries` and
 * `championWinRates` are rendered exactly as the api's `GET /leaderboard`/`GET /leaderboard/champions`
 * returned them (already ranked server-side), the same "client only renders, server decides" principle
 * every other screen in this project follows.
 */
export function LeaderboardScreen(props: { view: LeaderboardView; onBack: () => void }): JSX.Element {
  const { view, onBack } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  // Fetch-on-mount (11_client_7's own scope decision: fetch-on-mount plus a manual Refresh button, no
  // polling/auto-refresh — the SRS's own stimulus/response sequence, §3.2.8.4, is plain request/response).
  useEffect(() => {
    view.getController().operation('refresh');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const model = view.getModel();
  const controller = view.getController();

  return (
    <div aria-label="leaderboard" className="screen screen-leaderboard">
      <div className="card leaderboard-card">
        <h2 className="leaderboard-title">Leaderboard</h2>
        <div className="leaderboard-actions">
          <button onClick={() => controller.operation('refresh')} className="btn btn-secondary">
            Refresh
          </button>
          <button onClick={onBack} className="btn btn-secondary">
            Back
          </button>
        </div>

        {model.loading && model.entries === null && <p className="leaderboard-loading">Loading…</p>}
        {model.error && (
          <p role="alert" className="alert-error">
            {model.error}
          </p>
        )}

        {model.entries !== null && (
          <>
            {model.entries.length === 0 ? (
              <p className="leaderboard-empty">No games recorded yet.</p>
            ) : (
              <ul aria-label="leaderboard-entries" className="leaderboard-entries">
                {model.entries.map((entry, index) => (
                  <li key={entry.username} className="leaderboard-entry">
                    <span className="leaderboard-rank">{index + 1}</span>
                    <span className="leaderboard-username">{entry.username}</span>
                    <span className="leaderboard-record">
                      {entry.wins}W / {entry.losses}L / {entry.draws}D
                    </span>
                    <span className="leaderboard-games">{entry.gamesPlayed} games</span>
                    <span className="leaderboard-winrate">{(entry.winRate * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {model.championWinRates !== null && model.championWinRates.length > 0 && (
          <>
            <h3 className="leaderboard-subtitle">Champion Win Rates</h3>
            <ul aria-label="champion-win-rates" className="champion-win-rates">
              {model.championWinRates.map((entry) => (
                <li key={entry.championId} className="champion-win-rate-entry">
                  <span className="champion-win-rate-name">{ChampionRoster.getById(entry.championId).name}</span>
                  <span className="champion-win-rate-games">{entry.gamesPlayed} games</span>
                  <span className="champion-win-rate-value">{(entry.winRate * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
