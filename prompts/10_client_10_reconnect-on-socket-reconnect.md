# Prompt 10_client_10 — Emit match:reconnect when the socket reconnects

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.

### CRITICAL prerequisite
**`10_server_10_matchmaking-lifecycle-and-reconnection.md` must be merged to `main` first.** It builds the
server-side match registry that rebinds a reconnecting player's fresh connection to their still-active
match — without it, this prompt's client-side emission has nothing correct to talk to and can't be tested
end-to-end. Check `git log` on `main` for that prompt's commit before starting.

### CRITICAL: the real gap this closes
R6.1–R6.4 (SRS 3.2.6, "Essential" priority) require a disconnected player to be able to reconnect within a
30-second grace period and resume the match. A full audit (`07_shared_1`) found the client **never emits
`match:reconnect` anywhere** — confirmed by grep, zero matches in `packages/client/src`. The wire event
exists in the contract (`SOCKET_EVENTS.MATCH_RECONNECT`), the server-side handling in `DisconnectController`
already correctly calls `MatchModel.reconnect()` (grace-period check included) — but nothing on the client
side ever triggers it.

---

### Already traced — the trigger and the data you need both already exist
- **Trigger**: Socket.IO's client library fires its own `'connect'` event on the underlying `Socket` object
  both on the *first* successful connection and on *every* subsequent transport-level reconnect (the
  library's own automatic reconnection, which requires no application code — it just fires `'connect'`
  again once it succeeds). This is the right hook: no page reload is involved in a "transient network loss"
  (SRS 2.6's own framing of the scenario this feature handles) — the browser tab and its in-memory models
  are untouched, only the socket connection dropped and came back.
- **Re-identifying is required first, and everything needed for it is already in memory.**
  `ServerMain`'s fresh `ConnectionHandler` (built on the new server-side connection Socket.IO creates for
  the same client) starts with `identified = false` — every other event is rejected
  (`UnidentifiedConnectionError`) until `identify` arrives again. `packages/client/src/controller/LobbyController.ts`
  already shows the exact shape to replay: `identityModel.playerId` and `identityModel.username` are both
  still set on the in-memory `ClientIdentityModel` instance (they only get cleared by a full page reload,
  not a transient socket drop) — read that file's `submitUsername` case for the exact `IdentifyPayload`
  shape (`{playerId, username}`) to reuse.
- **Whether to also emit `match:reconnect`**: check `ClientMatchModel.matchId` and `.phase` — non-null
  `matchId` and `phase !== MatchPhase.ENDED` means there's a match worth trying to resume.
- **Where to wire this**: `packages/client/src/ClientMain.tsx`'s `ClientMain.main()`, right after
  `socketController` is constructed — that's the one place the raw `socket`, `identityModel`, and
  `matchModel` are all in scope together, and it already accepts a `socketFactory` parameter specifically
  so tests never need a real connection (master context §4.2) — your test should use a mock socket with a
  way to trigger its `'connect'` handler manually, not a real Socket.IO server.

### Process
1. Read `ClientMain.tsx`, `LobbyController.ts`, `ClientIdentityModel.ts`, and `ClientMatchModel.ts` — the
   real current files, not this prompt's paraphrase.
2. In `ClientMain.main()`, register a `socket.on('connect', () => {...})` handler. On each firing: if
   `identityModel.username !== null` and `identityModel.playerId !== null` (i.e. this connection has
   already identified once before — guards correctly against firing anything on the very first, pre-login
   connect), re-emit `identify` with the existing `{playerId, username}` via
   `socketController.operation(SOCKET_EVENTS.IDENTIFY, ...)`. Then, if `matchModel.matchId !== null &&
   matchModel.phase !== MatchPhase.ENDED`, also emit `socketController.operation(SOCKET_EVENTS.MATCH_RECONNECT)`.
3. Write tests first: a mock socket whose `'connect'` handler you can invoke directly. Cases: first connect
   with no prior identity emits nothing; a reconnect after identifying (no active match) re-emits `identify`
   only; a reconnect after identifying with an active, non-ended match emits both `identify` and
   `match:reconnect`, in that order (the server needs to have re-identified this connection before
   `match:reconnect` can pass `requireIdentified()` server-side — verify this ordering in your test, don't
   assume the two emits are independent of order).
4. Implement, run `npm run typecheck -w @arena/client` and `npx jest --coverage` for every touched file
   until green. Report real coverage numbers.
5. Add a Step 10 correction note to `docs/01_class_list.md`'s `ClientMain` entry documenting the new
   `'connect'` handler, matching the format of the existing correction notes in that file.

---

### Verification and Git
Report real `npm run typecheck -w @arena/client` and `npx jest --coverage` output. Branch `client` from
`main` (check `git log` for divergence first — this project has hit stale-branch conflicts twice already;
pull `main` before starting, not after), commit `Step 10: emit match:reconnect on socket reconnection
(closes R6.1-R6.4 client-side gap)`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this is untestable as a true end-to-end guarantee without `10_server_10` merged first — your
own test suite should mock the socket and verify the client emits the right events in the right order, but
note explicitly in your PR description that full server+client reconnection has not been manually verified
end-to-end unless you actually did that (e.g. via two local client instances and killing/restoring a
connection) — don't imply more confidence than the test suite actually provides.**
