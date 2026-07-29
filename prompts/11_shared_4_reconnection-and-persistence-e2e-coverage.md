# Prompt 11_shared_4 — E2E coverage for reconnection and match persistence (two real gaps)

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.

### CRITICAL prerequisite
`11_shared_2_e2e-acceptance-test.md` and `11_shared_3_ci-pipeline.md` must already be merged — this
prompt extends the existing `e2e/` suite, it doesn't build new scaffolding from scratch.

### CRITICAL: two real, confirmed gaps found during a full audit after Step 11's first pass
1. **R6.1–R6.4 (disconnect/reconnect) has never been exercised end-to-end.** Confirmed by grep —
   `e2e/match.spec.ts` contains zero disconnect/reconnect handling. The server-side wiring
   (`10_server_10`), client-side emission (`10_client_10`), and grace-period logic (`09_server_5`) have
   each only ever been tested in isolation with mocks. **Whether this actually works as an integrated
   whole has never been verified.**
2. **Match reporting → persistence → leaderboard has zero permanent test coverage**, despite genuinely
   working — verified with a throwaway script during the same audit: a real match's result showed up
   correctly on a real `GET /leaderboard` after ending. That verification was never committed. Nothing in
   the committed suite would catch a future regression on this path.

A third, smaller gap surfaced investigating #1: **no client view ever displays anything for
`match:player_disconnected`/`match:player_reconnected`.** The server already emits both correctly
(`PlayerDisconnectedPayload` includes `gracePeriodSeconds`), but `SocketConnectionController`'s own doc
comment admits these were "deliberately not routed to any model... a view wanting a transient banner can
listen to the raw socket event directly" — nobody has actually built that banner. Without it, R6.2's
"notifies the remaining player of a disconnection and the remaining grace period" is only true at the wire
protocol level, not from the actual human player's perspective (3.6.5 Usability). Fix this as part of this
prompt — it's also what makes the new e2e test able to assert anything visible actually happened.

---

### Part 1 — a minimal live disconnect notification in the client
Add a small piece of UI to `MatchHUDScreen` (paired with `MatchHUDView`) that shows something like
"Opponent disconnected — reconnecting in Ns" while the opponent is disconnected, and clears when
`match:player_reconnected` arrives. Read `SocketConnectionController.ts`'s existing doc comment (around
its `bindInboundEvents` method) for the reasoning already left there about *why* this isn't routed through
a model — decide for yourself the cleanest way to get this event to the view without violating that
reasoning (a raw socket listener the view/controller sets up directly is one option; a new transient,
UI-only field is another — your call, but keep it minimal, this is a live status indicator, not new
persisted state). Update `docs/01_class_list.md` if this changes any documented class's shape.

### Part 2 — a real disconnect/reconnect e2e test
Add a new test (either a new `it()` in `e2e/match.spec.ts` or a new file in `e2e/` — your call) that:
1. Gets two players into an active match (reuse/extract the existing `identifyAndQueue`/`selectChampion`
   helpers rather than duplicating them).
2. Disconnects one player's real connection — `BrowserContext.setOffline(true)` is the right tool (it
   simulates real network loss at the browser level, which should cause the underlying Socket.IO
   connection to actually drop and the server to detect a real `'disconnect'` event, not a mocked one).
3. Asserts the *other* player sees the disconnect banner from Part 1.
4. Waits a real but modest amount of time (a few seconds — enough to prove the connection genuinely
   dropped and the match didn't end, not the full 30s grace period) then reconnects —
   `setOffline(false)`, and confirm the client's existing `'connect'` handler (`10_client_10`) actually
   re-identifies and emits `match:reconnect` for real.
5. Asserts play resumes: the disconnect banner clears, and a combat action from either player after
   reconnecting still works (proving the match state wasn't corrupted by the disconnect).

**Optional, only if you have time budget for it**: a second test letting the grace period actually expire
(a real ~30+ second wait, no reconnect) and asserting the match correctly ends as a `DISCONNECT_FORFEIT`.
This is a real, valuable confirmation that the live `TickLoop`-driven timing path works, not just the
grace-period math in isolation (already unit-tested at the 29.9s/30.1s boundary) — but it will slow the
suite down meaningfully. Use your judgment; this prompt's `MUST` is the reconnect-within-grace-period path
above, this expiry path is a nice-to-have.

### Part 3 — permanent coverage for match persistence
Extend the *existing* elimination-match test in `e2e/match.spec.ts` (don't write a separate test that
duplicates playing a full match) to, after the Victory/Defeat assertions, poll `GET
http://localhost:{API_PORT}/leaderboard` (import `API_PORT` from `e2e/global-setup.ts`, matching the
pattern already established there) until the two players' usernames appear or a reasonable timeout elapses
— `MatchReportingListener`'s calls are fire-and-forget, so a single immediate check would be flaky. Assert
the win/loss came through correctly for both players. Playwright's built-in `request` fixture (already
available in every test, no new dependency) is the right tool for this — no need for a raw `fetch` or a
new HTTP client.

### Process
1. Read `e2e/match.spec.ts`, `e2e/global-setup.ts`, `SocketConnectionController.ts`, and
   `MatchHUDView.tsx` in full — real current files, not this prompt's paraphrase.
2. Build Part 1 first (TDD: a Jest test for the new client-side display logic, same as every other client
   change in this project), then Parts 2 and 3 against the real running stack.
3. Run the full e2e suite (not just your new tests) at least twice in a row from a cold `docker compose
   down -v`, matching `11_shared_2`'s own closing requirement — this project has already had two separate
   incidents of "verified locally, broke on a truly clean checkout," don't be the third.
4. Report real numbers: how long does the new disconnect/reconnect test actually take end to end?

---

### Verification and Git
Report the real output of the full e2e suite (all tests, not just the new ones), and the client's Jest
suite for Part 1's addition. Confirm no leaked Docker containers or lingering listeners after teardown
(check `docker ps -a` and the relevant ports). Branch `shared` from `main` (check `git log` for divergence
first), commit `Step 11: e2e coverage for disconnect/reconnect and match persistence`, push, open a PR
into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: if the disconnect/reconnect test reveals the wiring genuinely doesn't work end-to-end — despite
every individual piece being correct in isolation, exactly the pattern this project has hit three times
already (`10_server_9`, `10_server_10`/`10_client_10`, and this same audit's two other findings) — fix it
for real, the same way `11_shared_2` fixed the four bugs it found. Don't weaken the test to make it pass;
don't report a gap you found without also closing it, unless it's genuinely out of scope for this prompt —
and if so, say exactly why in your PR description.**
