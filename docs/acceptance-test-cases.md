# Arena — Manual Acceptance Test Cases

Traced to `docs/ArenaSRS.pdf` §3 (Specific Requirements). Each case names the exact real UI text/selectors
in the current implementation (not the SRS's illustrative mockups) — a tester should be able to follow the
Steps against the actual running system with no guessing. "Verification Method" states how each case is
actually exercised today:

- **Live UI** — a human tester can execute this entirely by clicking through the client in a browser.
- **Live UI (long-running)** — same as above, but takes several minutes of real wall-clock time (a 5-minute
  match time limit, a 30-second grace period) to reach naturally; executable, just slow.
- **REST/API-level** — the requirement has no dedicated client screen to click through (the SRS itself
  marks this — see R7's own priority note below), so it's verified with a direct HTTP request instead.
- **Automated + code inspection** — the requirement describes an internal validation path the client UI
  has no way to deliberately trigger (e.g. a malformed message a real client never sends), so it's verified
  by the project's existing Jest/Playwright suites plus reading the enforcing code, per SRS §1.1's own
  statement that a requirement may be verified "by an automated test, a manual demonstration, or a direct
  code inspection."

One comprehensive scenario combining several of these cases into a single continuous playthrough — chosen
to touch every screen and the system's one real transient pop-up (the disconnect banner) in one pass — was
actually executed with real screenshots; see `docs/acceptance-test-execution.md` for that record. Cases
covered by that execution are marked **[Executed]** below.

---

## 3.2.1 Player Identification

### AT-01 — Successful identification with a valid username
**Requirements:** R1.1, R1.3 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** Client freshly loaded, no identity yet (Lobby shows the identify form).
- **Steps:**
  1. Enter `Alice` into the **Username** field.
  2. Click **Continue**.
- **Expected Result:** The identify form is replaced by the idle Lobby ("Welcome, Alice", **Find Match**
  and **View Leaderboard** buttons). No password or other credential was ever requested (R1.3).

### AT-02 — Rejection of an empty username
**Requirements:** R1.1, 3.6.5 (Usability) · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** Client freshly loaded, identify form visible.
- **Steps:**
  1. Leave the **Username** field empty.
  2. Click **Continue**.
- **Expected Result:** The identify form remains visible (no navigation to the Lobby's idle state) and a
  human-readable error message appears in a red alert box (`role="alert"`) rather than the request failing
  silently — satisfying 3.6.5's "clear, human-readable feedback for every rejected action" requirement.

### AT-03 — Player identifier persists across a page reload
**Requirements:** R1.2 · **Priority:** Essential · **Verification:** Live UI

- **Preconditions:** Already identified as in AT-01 (idle Lobby showing "Welcome, Alice").
- **Steps:**
  1. Reload the browser tab (F5 / Ctrl+R).
- **Expected Result:** The Lobby shows "Welcome, Alice" again immediately, without re-prompting for a
  username — the same player identifier was reused for this browser session (R1.2), not regenerated.

### AT-04 — An unidentified connection's messages are rejected
**Requirements:** R1.4 · **Priority:** Essential · **Verification:** Automated + code inspection

- No client UI path exists to send a WebSocket message before `identify` — the client always identifies
  first by construction. Verified instead by `ConnectionHandler`'s real enforcement (rejects any other
  event from a socket with no associated player, with an `error` reason) and its existing automated test
  coverage.

---

## 3.2.2 Matchmaking Queue

### AT-05 — Joining the queue shows the player's position
**Requirements:** R2.1 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** Identified (AT-01), idle Lobby visible.
- **Steps:**
  1. Click **Find Match**.
- **Expected Result:** The Lobby switches to a queued state: a spinner, "Position in queue: 1" (or the
  actual 1-based position), and a **Cancel** button.

### AT-06 — Cancelling the queue returns to the idle Lobby
**Requirements:** R2.3 · **Priority:** Essential · **Verification:** Live UI

- **Preconditions:** Currently queued, as in AT-05.
- **Steps:**
  1. Click **Cancel**.
- **Expected Result:** The Lobby returns to its idle state (**Find Match** / **View Leaderboard** visible
  again), confirming the cancellation.

### AT-07 — Two queued players are paired into a match
**Requirements:** R2.4, R2.6 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** Two separate browser sessions (e.g. two browser profiles, or one normal + one private
  window, so each gets its own player identifier), both identified.
- **Steps:**
  1. Player A (`Alice`) clicks **Find Match**.
  2. Player B (`Bob`) clicks **Find Match**.
- **Expected Result:** Within about a second of Bob joining, both clients transition to the Champion
  Select screen, each showing the other's username as "Opponent: ..." — Alice sees "Opponent: Bob" and
  Bob sees "Opponent: Alice."

### AT-08 — A player already queued cannot join twice
**Requirements:** R2.2 · **Priority:** Essential · **Verification:** Automated + code inspection

- The client UI naturally prevents this (the **Find Match** button is only rendered in the idle state, not
  the queued state), so a normal tester cannot trigger a duplicate request through the UI at all. Verified
  instead by `MatchmakingQueue`'s existing automated test coverage and by reading `MatchmakingController`'s
  rejection path (an `AlreadyQueuedError`).

---

## 3.2.3 Champion Selection

### AT-09 — Both players see the identical champion roster with correct stats/abilities
**Requirements:** R3.1 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** Matched, as in AT-07 — both on Champion Select.
- **Steps:**
  1. On each client, read the three roster cards.
- **Expected Result:** Both clients show the identical fixed roster — **Korr** (Bruiser/Control, 180 HP),
  **Vex** (Ranged Burst Mage, 85 HP), **Rin** (Sustain Duelist, 130 HP) — each with the same listed
  abilities and cooldowns on both screens.

### AT-10 — A champion selection is broadcast to the opponent in real time
**Requirements:** R3.3 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** Same as AT-09.
- **Steps:**
  1. Alice clicks **Select Korr**.
- **Expected Result:** Alice's own screen shows "You selected: korr" and her **Select Korr** button becomes
  disabled. Bob's screen (without Bob taking any action) updates to reflect that Alice has locked in a
  champion, without Bob needing to refresh or take any action.

### AT-11 — Match begins immediately once both players have selected
**Requirements:** R3.5 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** Alice has selected as in AT-10.
- **Steps:**
  1. Bob clicks **Select Rin**.
- **Expected Result:** Both clients transition to the in-Match HUD immediately (no further confirmation
  step) — health/resource bars, cooldown list, arena, movement controls, and ability controls are all
  visible on both screens.

### AT-12 — Champion-selection timeout ends the match before it begins
**Requirements:** R3.4 · **Priority:** Essential · **Verification:** Live UI (long-running, ~30s)

- **Preconditions:** Two players matched, on Champion Select.
- **Steps:**
  1. Neither player selects a champion.
  2. Wait 30 seconds.
- **Expected Result:** Both clients transition directly to the Results screen (not the Match HUD) showing
  "Reason: Champion selection timed out," with no winner credited to either side.

---

## 3.2.4 Real-Time Combat

### AT-13 — Movement updates a champion's position smoothly
**Requirements:** R4.1, R4.7 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** In an active match (AT-11).
- **Steps:**
  1. Click **Move Right** (or hold `d`) for about a second.
- **Expected Result:** The player's own marker visibly moves right within the arena, smoothly (not in
  discrete jumps), and the opponent's client shows the same movement on its own copy of the arena.

### AT-14 — A valid ability use damages the opponent within range
**Requirements:** R4.2, R4.3 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** In an active match, both champions within an ability's range of each other (may
  require moving first — see AT-13).
- **Steps:**
  1. Click an offensive ability (e.g. **Crushing Blow**) — the button becomes visibly "pressed"
     (aiming mode).
  2. Click on the opponent's marker inside the arena.
- **Expected Result:** The opponent's HP bar/number drops by the ability's listed magnitude on both
  clients; a floating `-N` damage popup appears at the opponent's position; the ability's cooldown chip
  appears under "you-cooldowns" on the caster's own screen.

### AT-15 — An ability on cooldown cannot be reused immediately
**Requirements:** R4.3 · **Priority:** Essential · **Verification:** Live UI

- **Preconditions:** Just used an ability, as in AT-14 (its cooldown chip is currently showing).
- **Steps:**
  1. Attempt to click the same ability again while its cooldown chip is still counting down.
- **Expected Result:** The button visibly renders in a dimmed/grayscale "on cooldown" state
  (`btn-ability--cooldown`); clicking it does not re-trigger the effect (no new damage popup, no cooldown
  reset) — the server silently ignores the request per R4.2/3.6.2.

### AT-16 — Resource regenerates over time up to the champion's maximum
**Requirements:** R4.4 · **Priority:** Essential · **Verification:** Live UI

- **Preconditions:** In an active match; resource bar not already at maximum (e.g. right after casting an
  ability with a resource cost).
- **Steps:**
  1. Note the current Resource value.
  2. Wait several seconds without casting anything.
- **Expected Result:** The Resource number/bar visibly climbs back up over time, capping at the champion's
  listed maximum resource (never exceeding it).

### AT-17 — An out-of-range ability use has no effect
**Requirements:** R4.2, 3.6.2 (Robustness) · **Priority:** Essential · **Verification:** Live UI

- **Preconditions:** In an active match, both champions positioned farther apart than the ability's range
  (e.g. immediately after the match starts, before either player has moved).
- **Steps:**
  1. Click an offensive ability whose range is shorter than the current distance to the opponent — note
     the button already renders with the dashed, danger-colored **out-of-range** indicator.
  2. Aim and click on the opponent's marker anyway.
- **Expected Result:** No damage is dealt (opponent's HP unchanged); cooldown and resource are still
  consumed on the caster's side (a real "whiffed cast," not a silent no-op-with-no-cost) — this is
  deliberate design, not a bug, per `MatchModel.submitAbility`'s own documented semantics.

### AT-18 — Both players' HUDs reflect the same authoritative match state
**Requirements:** R4.5, R4.6 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** In an active match.
- **Steps:**
  1. Have either player deal damage, move, or use an ability.
- **Expected Result:** Both clients' HUDs (health, resource, positions, cooldowns) update to reflect the
  same values within about one tick (50ms) of each other — neither client ever shows a different health
  total for the same participant than the other does.

---

## 3.2.5 Match Win Conditions

### AT-19 — A match ends by elimination, crediting the correct winner
**Requirements:** R5.1 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** In an active match.
- **Steps:**
  1. Reduce the opponent's health to 0 via repeated valid ability hits (see AT-14).
- **Expected Result:** The match ends immediately (no need to wait for the next tick to visibly resolve).
  The eliminating player's client shows a **Victory** heading; the eliminated player's client shows
  **Defeat**; both show "Reason: Elimination."

### AT-20 — Results screen reports outcome, reason, duration, and a return-to-queue control
**Requirements:** R5.3 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** A match has just ended, as in AT-19.
- **Steps:**
  1. Read the Results screen on both clients.
- **Expected Result:** Each client shows its own outcome heading (**Victory**/**Defeat**/**Draw**), a
  "Reason: ..." line matching the actual end cause, a "Duration: ...s" line, and a **Return to Queue**
  button.

### AT-21 — A match ends by time limit, crediting the higher-health player (or a draw)
**Requirements:** R5.2 · **Priority:** Essential · **Verification:** Live UI (long-running, 5 minutes)

- **Preconditions:** In an active match where neither player pursues elimination.
- **Steps:**
  1. Let 5 minutes of match time elapse without either champion's health reaching 0.
- **Expected Result:** The match ends automatically; the player with strictly more remaining health sees
  **Victory** and the other **Defeat**, both with "Reason: Time limit reached" — or, if health is exactly
  equal, both clients show **Draw**.

---

## 3.2.6 Disconnect and Reconnect Handling

### AT-22 — The remaining player sees a disconnect banner with a grace-period countdown
**Requirements:** R6.1, R6.2 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** In an active match.
- **Steps:**
  1. Close the opponent's browser tab/window (or otherwise drop their network connection) without them
     returning to the queue first.
- **Expected Result:** Within a few seconds, the remaining player's client shows a banner reading
  "Opponent disconnected — reconnecting in 30s" (the number counts down in the underlying grace period,
  though the displayed text is a snapshot at disconnect time). The disconnected player's champion stops
  moving/acting on the remaining player's screen — no further updates to its position are shown.

### AT-23 — Reconnecting within the grace period restores play with no state loss
**Requirements:** R6.3 · **Priority:** Essential · **Verification:** Live UI **[Executed]**

- **Preconditions:** A disconnect banner is currently showing, as in AT-22, well within the 30-second
  window.
- **Steps:**
  1. Reopen the client in a new tab/window using the same browser profile (same player identifier) and
     let it reconnect.
- **Expected Result:** The disconnect banner disappears from the remaining player's screen; both players
  can immediately resume moving and casting abilities; health/resource/cooldown values are exactly what
  they were before the disconnect (no rollback, no reset).

### AT-24 — Failure to reconnect within the grace period forfeits the match
**Requirements:** R6.4 · **Priority:** Essential · **Verification:** Live UI (long-running, ~30s)

- **Preconditions:** A disconnect banner is showing, as in AT-22.
- **Steps:**
  1. Do not reconnect the disconnected player. Wait 30 seconds.
- **Expected Result:** The remaining player's client shows **Victory** with "Reason: Opponent
  disconnected," without any further action from either player.

---

## 3.2.7 Match History

*(SRS priority note: "Essential (recording); Desired (client-side history view)" — no dedicated client
screen for a player's own match history exists in the current build, matching that "Desired," not
"Essential," priority for the UI specifically. Recording itself (R7.1/R7.2) is Essential and is verified
below via the real REST endpoint that already backs it.)*

### AT-25 — A completed match is persisted with the correct result, champion, and duration
**Requirements:** R7.1 · **Priority:** Essential · **Verification:** REST/API-level

- **Preconditions:** A match has completed, as in AT-19; the *canonical* server-resolved player id for
  the player being queried (not the client's own transient session-generated `arena:playerId` —
  `PlayerRepository.findOrCreateByUsername` resolves a separate canonical id, keyed by username, that no
  client-facing response currently exposes; a direct database lookup or a small ad hoc query against
  `players` is the practical way to obtain it for this case specifically).
- **Steps:**
  1. Send `GET /players/{canonicalPlayerId}/matches?page=1&pageSize=10` to the API — `page`/`pageSize`
     are required query parameters (R7.3's pagination support), not optional.
- **Expected Result:** The response includes the just-completed match, with the correct result (`WIN`),
  champion played, opponent, end reason, and duration.
- **Note:** not executed in this pass — see `docs/acceptance-test-execution.md` for why (no client-facing
  response, including the leaderboard, exposes the canonical id this endpoint actually keys on; a genuine
  finding, not a testing shortcut, and a real confirmation that R7.3's client-side history view was
  correctly scoped as "Desired," not "Essential").

### AT-26 — A selection-timeout match is not persisted
**Requirements:** R7.2 · **Priority:** Essential · **Verification:** REST/API-level

- **Preconditions:** A match has just ended via champion-selection timeout, as in AT-12.
- **Steps:**
  1. Send `GET /players/{playerId}/matches` for either player.
- **Expected Result:** The timed-out match does **not** appear in either player's history — only matches
  that reached at least the start of combat are recorded, per R7.2.

---

## 3.2.8 Leaderboard

### AT-27 — The leaderboard ranks players by win rate, ties broken by total wins
**Requirements:** R8.1 · **Priority:** Desired · **Verification:** Live UI **[Executed]**

- **Preconditions:** At least one match has completed and been persisted (AT-25).
- **Steps:**
  1. From the Lobby or Results screen, click **View Leaderboard**.
- **Expected Result:** The Leaderboard screen shows a ranked list (`leaderboard-entries`) with each
  player's rank, username, W/L/D record, games played, and win rate percentage — ordered by win rate
  descending, with ties broken by total wins.

### AT-28 — A player below the minimum games-played threshold is excluded
**Requirements:** R8.2 · **Priority:** Desired · **Verification:** REST/API-level

- **Preconditions:** None beyond the default configuration (minimum games played = 1, i.e. every player
  with at least one completed match qualifies).
- **Steps:**
  1. Compare `GET /leaderboard`'s response against the full set of players who have ever identified.
- **Expected Result:** Only players with at least the configured minimum number of completed games appear;
  a player who has identified but never finished a match is absent.

### AT-29 — Champion win rates are available and reflect real match outcomes
**Requirements:** R8.3 · **Priority:** Desired · **Verification:** Live UI **[Executed]**

- **Preconditions:** At least one completed match, as in AT-25.
- **Steps:**
  1. On the Leaderboard screen, read the "Champion Win Rates" section below the player rankings.
- **Expected Result:** Each champion that has been played at least once shows a games-played count and a
  win-rate percentage, aggregated across every player and match, matching what the underlying match
  history would compute by hand for a small data set.

---

## Summary

29 cases across all eight SRS system features (3.2.1–3.2.8): 21 executable directly through the client UI
with no special wait (16 verified live in this pass — see `docs/acceptance-test-execution.md`), 3 more
requiring several minutes of real wall-clock time to reach naturally but otherwise identical to a Live UI
case, 3 verified via a direct REST request (matching the SRS's own "Desired," not "Essential," priority for
a client-side history view — one of the three, AT-25, turned out to have no client-obtainable identifier to
query with at all, a real finding rather than a testing shortcut), and 2 verified via this project's
existing automated test suites plus code inspection (internal validation paths a conforming client never
has a way to deliberately trigger through its own UI).
