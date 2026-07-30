# Prompt 11_client_7 — Client-facing leaderboard screen

**Owner: the flagship agent (this chat), executed directly — not delegated.** Load
`prompts/00_master_context.md` first. Client-only — the backend already fully implements this feature.

**Do not execute this yet.** Marshall asked for this prompt written now, for documentation, and will say
explicitly when to run it.

### Why this exists
The SRS (`docs/ArenaSRS.pdf` §3.2.8, R8.1–R8.3) specifies a leaderboard: players ranked by win rate (ties
broken by wins), excluding anyone under a configurable minimum games-played threshold, plus a separate
summary of win rates per champion. Priority: **Desired**, not Essential.

**The backend is already 100% done** — confirmed by direct inspection, not assumption:
- `GET /leaderboard` (`LeaderboardController.getLeaderboard`, `packages/api/src/controller/LeaderboardController.ts`)
  returns `LeaderboardEntryDTO[]` (`username, wins, losses, draws, gamesPlayed, winRate`), computed fresh
  from persisted match history via SQL aggregation (R8.1), with a `?minGames=` query param defaulting to 1
  (R8.2).
- `GET /leaderboard/champions` (`LeaderboardController.getChampionWinRates`) returns `ChampionWinRateDTO[]`
  (`championId, gamesPlayed, winRate`), satisfying R8.3.
- Both are wired in `packages/api/src/ApiMain.ts`, fully unit-tested, and `GET /leaderboard` is already
  verified end-to-end by `e2e/match.spec.ts`'s `pollLeaderboardEntry` helper — but that helper calls the
  REST endpoint directly via Playwright's `request` fixture, **bypassing the UI entirely**, because there is
  no UI to go through.

**What's actually missing — the entire client side.** Confirmed via exhaustive grep of `packages/client/src`
for `leaderboard`/`Leaderboard`/`/leaderboard`: zero matches, anywhere. No screen, no model, no controller,
no fetch call, no button linking to one from any existing screen. `ChampionWinRateDTO` has a real, working,
tested endpoint behind it and **zero consumers anywhere in the entire repository**. This prompt's whole job
is building that missing client half — the backend needs no changes at all.

### CRITICAL: a real ambiguity in the SRS itself — read before executing, correct me if wrong
SRS 3.1.1 ("User Interfaces") is the section that formally enumerates every required client screen, and it
lists exactly **four**: Lobby, Champion Select, Match HUD, Results. It does not list a Leaderboard screen.
Yet SRS 1.3 (Scope) and 2.2 (Product Functions) both casually describe the client as letting a player "view
... a leaderboard" as part of its normal feature set. This is a genuine internal inconsistency in the SRS
baseline, not something this codebase got wrong — 3.1.1 is the section every other client-screen prompt in
this project has treated as authoritative, and it's silent on this one. Scope decisions made to resolve it,
stated explicitly so Marshall can correct any of them before I run this:

1. **A fifth screen, not a tab on an existing one.** Simplest to reason about and matches the SRS's own
   framing ("a leaderboard" as a distinct thing to view, not a sub-panel of Results).
2. **Navigation, since `AppRouter`'s routing is entirely state-driven and has no concept of a "current
   screen" independent of server-reported phase**: a plain `showLeaderboard: boolean` `useState` owned by
   `AppRouter` itself (`ClientMain.tsx`), checked *first*, before the existing four-way phase routing —
   when true, `LeaderboardScreen` renders instead of whatever else would. Two entry points call a passed-down
   `onViewLeaderboard: () => void` prop that flips it on: the Lobby screen's `idle` state (right below "Find
   Match" — a natural browsing moment before queueing) and the Results screen (right next to "Return to
   Queue" — a natural moment to check standings after a match). No entry point anywhere else (not during
   queueing, Champion Select, or an active match) — deliberately, to avoid it ever competing with combat.
   `LeaderboardScreen` gets a `Back` button that flips `showLeaderboard` off, returning to whatever the
   normal phase-based routing would already show.
3. **One screen, two stacked sections — not tabs.** Player ranking table, then a champion win-rate summary
   below it. Simpler than adding tab-switching state for a small, Desired-priority feature.
4. **`minGames` is not exposed as a UI control.** The API already accepts it (R8.2); this prompt just doesn't
   build a slider/input for it. Fetches with no `minGames` override, so the API's own default (1) applies.
   A real, later enhancement if wanted — not required to satisfy the SRS, which only requires the
   *capability* to exclude low-game players, not that the client expose it.
5. **Champion IDs are resolved to display names** (`ChampionRoster.getById(championId).name`) before
   rendering — raw `'korr'`/`'vex'`/`'rin'` strings would be a visible quality regression against every
   other screen in this client, which never shows a raw id to the player.
6. **Fetch-on-mount plus a manual Refresh button; no polling/auto-refresh.** The SRS's own stimulus/response
   sequence (§3.2.8.4) is plain request/response — "a client requests the leaderboard... the system
   returns players ranked..." — no push/live-update semantics implied, and this is the client's first-ever
   direct REST consumer (everything else goes through `SocketConnectionController`), so keep it simple.

---

### Scope

**1. `packages/shared` — no changes.** `LeaderboardEntryDTO`/`ChampionWinRateDTO` already exist
(`packages/shared/src/contract/dto.ts`) and are exactly what this prompt needs. Import them, don't redefine
them.

**2. New client API base URL constant**, mirroring `DEFAULT_SERVER_URL`'s exact existing pattern in
`ClientMain.tsx` (`__SERVER_URL__` global, injected via `vite.config.ts`'s `define`, backed by
`VITE_SERVER_URL`, defaulting to `'http://localhost:3001'` when the global is undefined — e.g. under Jest).
Add the parallel piece for the API: `vite.config.ts` gains
`__API_URL__: JSON.stringify(env.VITE_API_URL || 'http://localhost:4000')` (`4000` is the api's own real
default port — confirmed in `packages/api/src/ApiMain.ts`: `process.env.PORT ?? 4000`); `ClientMain.tsx`
gains `const DEFAULT_API_URL = typeof __API_URL__ !== 'undefined' ? __API_URL__ : 'http://localhost:4000'`,
same guard shape as the server one.

**3. `packages/client/src/model/ClientLeaderboardModel.ts`** (new) — `extends AbstractModel`, matching every
other client model. Fields: `entries: LeaderboardEntryDTO[] | null` (null until first successful fetch),
`championWinRates: ChampionWinRateDTO[] | null`, `loading: boolean`, `error: string | null`. Methods:
`setLoading(): void` (clears `error`, sets `loading = true`, notifies), `setLoaded(entries, championWinRates): void`
(sets both arrays, `loading = false`, `error = null`, notifies), `setError(message: string): void` (`loading
= false`, `error = message`, notifies — leaves any previously-loaded `entries`/`championWinRates` in place
rather than clearing them, so a failed *refresh* doesn't blank out data the player was already looking at).

**4. `packages/client/src/controller/LeaderboardController.ts`** (new) — `extends
AbstractController<ClientLeaderboardModel, LeaderboardView>`. This is the client's first REST-based
controller (every other controller forwards through `SocketConnectionController`/Socket.IO) — inject the
fetch implementation and base URL for the same testability reason `ClientMain.main()` injects `socketFactory`
(master context §4.2 — no test should need a real network call):
```ts
constructor(
  model: ClientLeaderboardModel,
  view: LeaderboardView,
  private readonly apiBaseUrl: string = DEFAULT_API_URL, // re-export or duplicate the same guarded constant
  private readonly fetchImpl: typeof fetch = fetch,
) { super(model, view); }
```
`operation(action: 'refresh')`: calls `model.setLoading()`, then `Promise.all([fetch(`${apiBaseUrl}/leaderboard`), fetch(`${apiBaseUrl}/leaderboard/champions`)])`,
checks both responses' `.ok`, parses both as JSON, calls `model.setLoaded(entries, championWinRates)` on
success. On a thrown/rejected fetch or a non-ok response, calls `model.setError(...)` with a clear message —
don't let an unhandled promise rejection escape. `operation()` is async internally but the method signature
stays `void`-returning (fire-and-forget, matching how a click handler calls it) — write a real test proving
the model transitions through `loading` → `loaded`/`error` correctly using a mocked `fetchImpl`, not just
that `fetch` was called.

**5. `packages/client/src/view/LeaderboardView.tsx`** (new) — `LeaderboardView implements View,
ModelListener` (constructor `(model, controller)`, `bindUpdateCallback`/`getModel`/`setModel`/
`getController`/`setController`/`modelChanged`, the exact same shape every other view in this codebase
already has — copy the pattern, don't reinvent it) pairs with a `LeaderboardScreen(props: { view:
LeaderboardView; onBack: () => void }): JSX.Element` function component:
- Fires `controller.operation('refresh')` once on mount (`useEffect`, empty deps).
- `aria-label="leaderboard"` on the screen's root container (matches this project's exhaustive
  aria-label-per-screen convention — see every other `screen-*` component).
- While `model.loading` and `model.entries === null` (first load): a loading indicator, no stale/empty table
  flash.
- If `model.error`: a visible error message (`role="alert"`, matching `LobbyScreen`'s existing precedent for
  user-facing errors) — this is the client's first REST-fetch-failure UI anywhere, so there's no existing
  pattern beyond that one to reuse, but match its spirit (clear, visible, not a silent console-only failure).
- Once loaded: `<ul aria-label="leaderboard-entries">` (or `<table>`, your call on markup, but keep the
  `aria-label`) — one row per `LeaderboardEntryDTO`, already server-ranked (don't re-sort client-side),
  showing username, wins, losses, draws, games played, and win rate as a percentage. **Confirmed, not
  assumed**: `LeaderboardRepository.ts`'s real SQL computes `win_rate` as
  `(COUNT(*) FILTER (WHERE result = 'WIN'))::float / COUNT(*)` — a plain `0`–`1` fraction, not `0`–`100` — so
  render it as `(winRate * 100).toFixed(1) + '%'` (or equivalent). Below it, `<ul aria-label="champion-win-rates">` — one row per
  `ChampionWinRateDTO`, champion name resolved via `ChampionRoster.getById(championId).name` (not the raw
  id), games played, win rate.
- A `Refresh` button (`controller.operation('refresh')`) and a `Back` button (calls the `onBack` prop —
  this screen doesn't own its own visibility, `AppRouter` does, per the scope decision above).
- Empty-state handling: if a fetch succeeds but returns an empty array (no matches played yet, or every
  player is under `minGames`), show that plainly ("No games recorded yet" or similar) rather than an
  empty, confusing-looking list.

**6. `ClientMain.tsx` wiring**:
- Construct `const leaderboardModel = new ClientLeaderboardModel();` alongside the other three models.
- `wirePair` it exactly like the existing four pairs: `(placeholder) => new LeaderboardView(leaderboardModel, placeholder)`,
  `(view) => new LeaderboardController(leaderboardModel, view)` (default `apiBaseUrl`/`fetchImpl` params
  apply — no need to thread anything extra through `main()`'s own signature).
- `AppRouter` gains `const [showLeaderboard, setShowLeaderboard] = useState(false);` and, as the *first*
  check in its render logic (before the existing `identityModel.username === null` / phase checks):
  ```ts
  if (showLeaderboard) {
    return <LeaderboardScreen view={leaderboardView} onBack={() => setShowLeaderboard(false)} />;
  }
  ```
- `LobbyScreen` and `ResultsScreen` each gain a new prop, `onViewLeaderboard: () => void` — `AppRouter`
  passes `() => setShowLeaderboard(true)` into both. `LobbyScreen`'s `idle`-state branch and
  `ResultsScreen` each render a `View Leaderboard` button calling it (`ResultsView.tsx`'s existing "Return
  to Queue" button is the pattern to sit this next to).

### TDD process
1. Read the real current `LeaderboardEntryDTO`/`ChampionWinRateDTO` definitions, `LeaderboardRepository.ts`'s
   actual SQL (specifically to nail down `winRate`'s real numeric range before writing any percentage-
   formatting code), `ClientMain.tsx`, `LobbyView.tsx`, and `ResultsView.tsx` in full before writing anything
   — this file set has grown across many prior prompts, don't work from a stale mental model.
2. Tests first, per piece: `ClientLeaderboardModel`'s state transitions; `LeaderboardController.operation('refresh')`
   against a mocked `fetchImpl` (success populates both arrays; a non-ok response and a rejected fetch both
   route to `setError`, not an unhandled rejection — write a test that actually asserts this, e.g. via
   `await Promise.resolve()` flushing or a spy, not just "doesn't throw"); `LeaderboardScreen`'s rendering
   for loading/error/empty/populated states, and that `Refresh`/`Back` dispatch correctly.
3. Implement, then wire `ClientMain.tsx`'s router/prop-threading — add a `ClientMain.test.tsx` end-to-end
   check that clicking "View Leaderboard" from the Lobby screen (mock a `fetch` that resolves with real
   `LeaderboardEntryDTO`/`ChampionWinRateDTO` fixtures) actually renders `leaderboard-entries`, matching this
   project's established "drive it through the real wiring, not by reaching into internals" checkpoint
   pattern (see that file's existing `CRITICAL CHECKPOINT` tests for the shape to match).
4. Full client Jest suite, `npm run typecheck -w @arena/client`, real coverage numbers.
5. **Extend `e2e/match.spec.ts`'s existing match test** — after the current `Victory`/`Return to Queue`
   assertions, click the real `View Leaderboard` button on the real Results screen and assert the real
   winner's row (username, `1` win) actually renders in the browser. This is a genuine upgrade over the
   suite's current leaderboard coverage, which only ever hits `GET /leaderboard` directly via Playwright's
   `request` fixture and never exercises the UI at all — don't remove the existing `pollLeaderboardEntry`
   check, add the UI-level one alongside it (the polling helper is still doing real, necessary work: waiting
   for the fire-and-forget server→api report to land before the UI assertion would have anything to find).
6. Run the full Playwright e2e suite twice in a row from a cold `docker compose -f docker-compose.test.yml
   down -v`.
7. Load the app in a real browser: click "View Leaderboard" from the Lobby before ever playing a match
   (confirm the empty-state message, not a crash or an infinite loading spinner) and again from Results
   after a real match (confirm real rows, correct win/loss for both players, champion win rates section
   populated and showing real champion names not raw ids). Describe exactly what you observed for each, in
   the PR description.

---

### Verification and Git
Report real `npm run typecheck` and full Jest output (with coverage) for `packages/client`, plus two full
cold-start Playwright e2e runs. Branch from `main` (check `git log` for divergence first), commit message
describing what was added and why (referencing that the backend needed zero changes, and that
`ChampionWinRateDTO` finally gets a real consumer), push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this prompt states `winRate` is a `0`–`1` fraction as a confirmed fact (read directly from
`LeaderboardRepository.ts`'s real SQL while writing this prompt) — re-confirm it against the actual file at
execution time rather than trusting this document blindly; if the schema/query has changed since, the
`* 100` formatting would need to change with it. Getting this wrong renders either "850%" or "0.85%" on
screen, a real, visible correctness bug easy to ship past casual testing if a screenshot isn't read
carefully.**
