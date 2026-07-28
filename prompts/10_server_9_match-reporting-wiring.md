# Prompt 10_server_9 — Wire MatchReportingClient into the live match lifecycle

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.

### CRITICAL: this closes a real SRS gap, not a cosmetic one
`MatchReportingClient.reportMatchBegin`/`reportMatchEnd` (built in `10_server_6`) are implemented, unit
tested, and correct — but **nothing in the running server ever calls them.** `ServerMain.ts` says so
explicitly in its own comment: *"MatchReportingClient is deliberately not constructed/wired here... no
call site exists yet in this batch."* As a direct result, **R7.1–R7.4 (match history persistence) and, by
extension, R8.1–R8.3 (leaderboard) and R-DB1–R-DB6 are non-functional end-to-end** in the live
application right now, even though every individual class involved (api-side and server-side) is correct
and fully tested in isolation. This was found during a full audit against the SRS — not by any existing
test, since it is a wiring gap invisible to unit tests. Closing it is this prompt's entire purpose.

---

### Where this belongs, and why (already traced — do not re-derive from scratch)
Read these four files first, in this order, to see the exact current shape:
1. `packages/server/src/model/MatchModel.ts` — note the two `notifyChanged` calls that matter:
   `'match:start'` (fires exactly once, only after **both** players have selected a champion — i.e. it
   already satisfies R7.2's "don't record a selection-timeout match" precondition for free, since a match
   that times out during Champion Select never reaches this line) and `'match:end'`
   (`{ matchId, reason, winningTeam, durationMs }`).
2. `packages/shared/src/contract/events.ts` — `ParticipantSnapshot` (nested inside `match:start`'s
   `initialState` payload) already carries `championId` per participant. You do not need to add a new
   field to `MatchModel` to get champion IDs at match-start time — they're already in the event payload.
3. `packages/server/src/controller/MatchmakingController.ts`'s private `createMatch()` method
   (around line 76) — this is where `new MatchModel(matchId, [playerA, playerB])` is constructed, and
   `playerA`/`playerB` (full `Player` objects, with `.username`) are in scope right there and nowhere
   else afterward — **`MatchModel` itself never retains the `Player.username` values**, only
   `ParticipantState.playerId`. This is why the reporting hook cannot live inside `MatchModel` (it doesn't
   have the data) and must not be added there — keep persistence/reporting concerns out of the Model
   layer, consistent with `MatchModel` having zero network/HTTP dependencies (3.6.4).
4. `packages/shared/src/contract/dto.ts` — `MatchBeginReportDTO`'s `participants` array needs
   `{playerId, username, team, championId}` per entry (see `BeginParticipant`'s doc comment in
   `packages/api/src/model/PendingMatchCorrelator.ts` for the full reasoning already written up there).

### Design: a new `ModelListener`, not a change to `MatchModel` or `MatchBroadcastView`
`MatchBroadcastView` already listens to `MatchModel` and reacts to these same two events by emitting
Socket.IO broadcasts — the push-notification pattern supports multiple independent listeners on one
`Model`, so **do not extend `MatchBroadcastView`'s responsibilities.** Instead:

1. Create `packages/server/src/controller/MatchReportingListener.ts` — implements `ModelListener` (not
   `View` — it has no paired controller and broadcasts nothing to a socket). Constructor takes
   `(match: MatchModel, players: [Player, Player], reportingClient: MatchReportingClient)`, registers
   itself via `match.addModelListener(this)`. `modelChanged(event)`:
   - On `event.type === 'match:start'`: zip `players` (for `playerId`/`username`) with
     `event.payload.initialState.participants` (for `team`/`championId`) into a `BeginParticipant[]`
     (matching each by `playerId`, don't assume array order is preserved — verify it, don't assume), call
     `reportingClient.reportMatchBegin(matchId, participants)`.
   - On `event.type === 'match:end'`: call `reportingClient.reportMatchEnd(matchId, {endReason: reason,
     winningTeam, durationMs, endedAt: new Date()})` — check `MatchEndReportDTO`'s exact field names in
     `dto.ts` before assuming these match; adjust to whatever it actually declares.
   - Per-participant `result` (win/loss/draw) is **not** in `MatchModel`'s `'match:end'` payload — you'll
     need to derive it from `winningTeam` vs. each participant's own `team` (win if same team as
     `winningTeam`, loss if opposing, draw if `winningTeam` is null), matching `MatchResult`'s three
     values. Check whether `MatchEndReportDTO`/`MatchRepository.recordMatch`'s participants shape expects
     this pre-computed or expects the api side to derive it — read `packages/api/src/model/MatchRepository.ts`
     and `packages/api/src/controller/InternalMatchController.ts` to see which side already does this
     derivation before deciding whether it belongs here too (don't duplicate it if the api side already owns it).
2. In `MatchmakingController.createMatch()`, construct a `MatchReportingListener` right after
   `matchBroadcastView` is constructed, passing `[playerA, playerB]` and a `MatchReportingClient` instance.
   `MatchmakingController` will need a new constructor parameter for the `MatchReportingClient` (or its
   `apiBaseUrl`) — thread it through from `ServerMain.main()`, which is where `MatchReportingClient` should
   actually be constructed (once, using an `API_BASE_URL` env var — check `MatchReportingClient`'s
   constructor signature for the exact parameter it expects).
3. Remove the "deliberately not constructed" comment block in `ServerMain.ts` and construct the real
   `MatchReportingClient` there instead, passing it down to wherever `MatchmakingController` gets built.

### TDD process
1. Read every stub/current file named above — ground truth, not this prompt's paraphrase.
2. Write tests first for `MatchReportingListener`: mock `MatchReportingClient` (don't make real HTTP
   calls in this test file — that's `MatchReportingClient`'s own test's job, already done). Assert
   `reportMatchBegin` is called with the correct `matchId`/participants shape when `MatchModel` emits
   `'match:start'`, and `reportMatchEnd` similarly for `'match:end'`. Include a test that a
   selection-timeout match (which never emits `'match:start'`) never triggers `reportMatchBegin` — this is
   R7.2's guarantee and should be verified, not assumed.
3. Update `MatchmakingController.test.ts` and `ServerMain.test.ts` for the new constructor parameter(s) —
   existing tests will fail to compile otherwise.
4. Implement, run `npm run typecheck -w @arena/server` and `npx jest --coverage` for every touched file
   until green. Report real coverage numbers.
5. Add a **Step 10 correction** note to `docs/01_class_list.md` documenting the new
   `MatchReportingListener` class and `MatchmakingController`'s/`ServerMain`'s changed constructors,
   matching the format of the existing correction notes already in that file (e.g. the
   `SocketConnectionController` one).

---

### Verification and Git
Report real `npm run typecheck -w @arena/server` and `npx jest --coverage` output for every file touched.
Branch `server` from `main` (or reuse an already-checked-out `server` branch — check `git log` first for
divergence from `main` before starting, per the lesson from the earlier stale-branch incidents this
project already hit twice), commit `Step 10: wire MatchReportingClient into live match lifecycle
(closes R7.1-7.4 gap)`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: after wiring, manually trace through — don't just rely on the unit test — that a match which
times out during Champion Select (never reaching `'match:start'`) truly never calls `reportMatchBegin`,
and that a match which completes normally calls `reportMatchBegin` exactly once and `reportMatchEnd`
exactly once. A double-call here would violate `PendingMatchCorrelator`'s idempotency guarantees being
exercised for the first time by a real caller instead of a test double — this is the first prompt where
that class gets driven by something other than its own unit test.**
