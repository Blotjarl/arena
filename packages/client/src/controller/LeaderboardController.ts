import { AbstractController, LeaderboardEntryDTO, ChampionWinRateDTO } from '@arena/shared';
import { ClientLeaderboardModel } from '../model/ClientLeaderboardModel';
import type { LeaderboardView } from '../view/LeaderboardView';

/**
 * Api URL this controller fetches against — same `define`d-global pattern `ClientMain.tsx`'s
 * `DEFAULT_SERVER_URL` already established for the Socket.IO connection (see that file's own doc comment
 * for why `__API_URL__` is a plain global rather than `import.meta.env.VITE_API_URL`). Kept local to this
 * file rather than imported from `ClientMain.tsx` to avoid a circular import (`ClientMain.tsx` constructs
 * this controller; it must not need to import back from it just for a default parameter value). `4000` is
 * the api's own real default port (`packages/api/src/ApiMain.ts`: `process.env.PORT ?? 4000`).
 */
const DEFAULT_API_URL = typeof __API_URL__ !== 'undefined' ? __API_URL__ : 'http://localhost:4000';

/**
 * Fetches leaderboard data from the api's REST endpoints (SRS 3.2.8, R8.1-R8.3) and populates
 * ClientLeaderboardModel. The client's first controller that talks directly to the api over plain HTTP —
 * every other controller forwards through SocketConnectionController/Socket.IO instead (master context
 * §2.3: "Client <-> API: ordinary HTTP/REST (match history, leaderboard)").
 */
export class LeaderboardController extends AbstractController<ClientLeaderboardModel, LeaderboardView> {
  /**
   * CORRECTION (master context §4.2 testability principle): `fetchImpl` is injected, defaulting to the
   * real global `fetch`, the same reason `ClientMain.main()` injects `socketFactory` instead of calling
   * `io(...)` directly — no test here needs a real network call.
   *
   * CORRECTION: the default wraps `fetch` in a closure (`(...args) => fetch(...args)`) rather than
   * referencing the global directly (`fetchImpl: typeof fetch = fetch`) — a default *parameter value* is
   * evaluated eagerly, at construction time, even when the caller passes an explicit `fetchImpl` and never
   * ends up using the default at all. This project's Jest/jsdom test environment has no global `fetch`
   * polyfilled, so `ClientMain.test.tsx`'s existing tests (which construct the full model/controller/view
   * graph via `ClientMain.main()`, including this controller, but never actually trigger a leaderboard
   * refresh) threw `ReferenceError: fetch is not defined` merely from *constructing* this controller. The
   * closure defers that reference until the default is actually *called*, not merely selected.
   * @param model - the leaderboard model this controller populates
   * @param view - the paired LeaderboardView
   * @param apiBaseUrl - the api's base URL; defaults to the configured/real api origin
   * @param fetchImpl - the fetch implementation to use; defaults to the real global `fetch`
   */
  constructor(
    model: ClientLeaderboardModel,
    view: LeaderboardView,
    private readonly apiBaseUrl: string = DEFAULT_API_URL,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {
    super(model, view);
  }

  /**
   * Dispatches a leaderboard action. Only `'refresh'` is supported — fetches `/leaderboard` and
   * `/leaderboard/champions` in parallel and populates the model on success. Fire-and-forget: this method
   * itself returns synchronously (matching every other controller's `operation()` signature, and how a
   * click handler calls it), but the model transitions through `loading` -> `loaded`/`error` asynchronously
   * as the real fetch resolves. A non-ok HTTP response and a rejected/thrown fetch both route to
   * `model.setError(...)` — neither is allowed to escape as an unhandled rejection.
   * @param action - only `'refresh'` does anything; any other value is a no-op
   */
  operation(action: string): void {
    if (action !== 'refresh') return;
    this.model.setLoading();
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      const [entriesRes, championsRes] = await Promise.all([
        this.fetchImpl(`${this.apiBaseUrl}/leaderboard`),
        this.fetchImpl(`${this.apiBaseUrl}/leaderboard/champions`),
      ]);
      if (!entriesRes.ok || !championsRes.ok) {
        this.model.setError(
          `Failed to load leaderboard (HTTP ${entriesRes.status}/${championsRes.status})`,
        );
        return;
      }
      const entries = (await entriesRes.json()) as LeaderboardEntryDTO[];
      const championWinRates = (await championsRes.json()) as ChampionWinRateDTO[];
      this.model.setLoaded(entries, championWinRates);
    } catch (err) {
      this.model.setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    }
  }
}
