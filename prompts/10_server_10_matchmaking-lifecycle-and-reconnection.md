# Prompt 10_server_10 — Matchmaking lifecycle guard + server-side reconnection rebinding

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.

### CRITICAL: two real, confirmed gaps, found by `07_shared_1`'s systematic audit and independently
### re-verified — not hypothetical
1. **R2.2 is silently unenforced.** `MatchmakingQueue.join()`'s own doc comment says it throws
   `AlreadyQueuedError` "if the player is already queued or already in an active match" — but the actual
   body only checks `this.entries.some(...)` (the queue itself). There is no participant-tracking
   structure at all for "currently in an active match." A player mid-match can re-queue and get paired
   into a second, simultaneous match right now.
2. **R2.5's concurrent-match bound never releases.** `tryPairNext()` increments `activeMatchCount` on every
   successful pairing; nothing anywhere decrements it. After `maxConcurrentMatches` matches have *ever*
   been played — even if all of them ended minutes ago — `tryPairNext()` returns `null` forever and
   matchmaking is permanently broken for the rest of the process's life.
3. **R6.1–R6.4 (reconnection) has no working path.** Confirmed by reading the code, not assumed: a
   disconnected player's browser tab is still alive and still has a live `Socket`, but Socket.IO's own
   transport reconnect gets a **new** server-side socket connection, meaning `ServerMain`'s
   `io.on('connection', ...)` fires again and constructs a **fresh** `ConnectionHandler` with only
   `{identify, matchmaking}` bound. `bindMatch()` (which sets `championSelect`/`combat`/`disconnect`) is
   only ever called from `MatchmakingController`'s `onMatchCreated` callback, which fires exactly once, at
   *original* pairing time. Nothing rebinds a reconnecting player's fresh connection to their still-active
   match — so even if `match:reconnect` arrives, `ConnectionHandler`'s own guard (`!this.disconnect →
   return`) silently drops it.

This prompt fixes all three. They're bundled into one prompt (not the usual one-fix-per-prompt pattern)
because all three share the same two integration points — `MatchmakingController.createMatch()` (where a
match is registered) and a match's `'match:end'` event (where things get cleaned up) — and building them
as separate prompts risks two independent sessions racing to add conflicting hooks to the same method.
`10_client_10_reconnect-on-socket-reconnect.md` (Raj's track) depends on the reconnection-rebinding half
of this prompt merging first — it is otherwise untestable end-to-end.

---

### Already traced — the good news is this is smaller than it looks
- `MatchBroadcastView`'s `sockets: Map<PlayerId, Socket>` is the **same shared reference** all the way up
  from `ServerMain`'s process-wide `sockets` map — confirmed by reading the constructor chain. And
  `ServerMain`'s existing `onIdentified` callback (passed into every `ConnectionHandler`) already does
  `sockets.set(player.id, socket); connectionHandlers.set(player.id, handler);` **on every successful
  identify, reconnect included** — this part already self-heals; broadcasts will already reach a
  reconnected player's new socket once they've re-identified. **Do not rebuild this.**
- `PlayerIdentifyController.operation('identify', ...)` never touches `MatchmakingQueue` — confirmed by
  reading it. Re-identifying on reconnect is safe and won't trip the new R2.2 guard you're adding.
- `MatchModel.reconnect()` (in `09_server_5`) already correctly implements the grace-period check and
  throws `GracePeriodExpiredError` when it's too late — **do not duplicate that logic here.** The fix in
  this prompt only needs to make `DisconnectController`/`ChampionSelectController`/`CombatController`
  *routable* again on the new connection; the actual reconnect-vs-expired decision stays exactly where it
  already correctly lives.

### Part 1 — `MatchmakingQueue`: R2.2 guard + R2.5 release
1. Add participant tracking — a `private activeParticipants: Set<PlayerId>` is the simplest shape, but use
   your judgment on the actual data structure.
2. `join()`: throw `AlreadyQueuedError` if the player is in `activeParticipants` too, not just `entries`.
3. `tryPairNext()`: add both paired players' ids to `activeParticipants` when a pairing succeeds.
4. Add a new method — `releaseMatch(playerIds: [PlayerId, PlayerId]): void` (name it what you think reads
   best) — that removes both from `activeParticipants` and decrements `activeMatchCount`. This needs to be
   called exactly once per match, when that match ends.

### Part 2 — match registry + rebind-on-reconnect, in `ServerMain`/`MatchmakingController`
1. Add a process-wide registry in `ServerMain.main()`, parallel to the existing `sockets`/
   `connectionHandlers` maps: something like `Map<PlayerId, { match: MatchModel; view: MatchBroadcastView }>`.
2. When `MatchmakingController.createMatch()` constructs a match (the same place `10_server_9`'s
   `MatchReportingListener` gets constructed), register both players into this new registry too. You'll
   need to thread it through the same way `sockets`/`onMatchCreated`/`reportingClient` are already threaded
   into `MatchmakingController`'s constructor — follow that existing pattern.
3. Add **one** `'match:end'` reaction (a small inline `ModelListener`, or extend an existing one — your
   call, but don't add two separate `'match:end'` listeners that each do half the cleanup) that, once per
   match: calls `queue.releaseMatch([playerIdA, playerIdB])` (Part 1) **and** removes both players from the
   new match registry (Part 2). This is the shared cleanup hook both parts of this prompt need — build it
   once.
4. In `ServerMain`'s existing `onIdentified` callback (the one that already does `sockets.set`/
   `connectionHandlers.set`), add: if the newly-identified player has an entry in the match registry, call
   `handler.bindMatch(entry.match, entry.view)` on this fresh `ConnectionHandler`. That's the entire fix —
   it makes `match:reconnect`/`match:action`/`champion:select` routable again; `MatchModel.reconnect()`'s
   own grace-period check (already correct, untouched) takes it from there once the client actually emits
   `match:reconnect`.

### TDD process
1. Read every file named above — ground truth, not this prompt's paraphrase.
2. Write tests first. For `MatchmakingQueue`: a player who's mid-match cannot re-queue (`AlreadyQueuedError`);
   `activeMatchCount` genuinely frees up after a `releaseMatch()` call, letting a 51st match pair once the
   default-50 bound would otherwise block it (this is effectively a 4th critical-checkpoint-style test —
   name it clearly as covering R2.5's release, not just R2.2). For the registry/rebind logic: a simulated
   fresh `ConnectionHandler` for a player with a registry entry gets `bindMatch()` called; a player with no
   entry does not; the registry entry is gone after `'match:end'` fires.
3. Implement, run `npm run typecheck -w @arena/server` and `npx jest --coverage` for every touched file
   until green. Report real coverage numbers.
4. Add Step 10 correction notes to `docs/01_class_list.md` for `MatchmakingQueue`'s new method/field,
   `ServerMain`'s new registry, and the changed `MatchmakingController` constructor — matching the format
   already established by the `10_server_9` corrections in that file.

---

### Verification and Git
Report real `npm run typecheck -w @arena/server` and `npx jest --coverage` output. Branch `server` from
`main` (check `git log` for divergence first), commit `Step 10: matchmaking queue lifecycle guard and
server-side reconnection rebinding`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: manually trace, and say so explicitly in your PR description, that a player whose match has
already ended (forfeited via grace-period expiry, eliminated, etc.) by the time a stray reconnect attempt
reaches the server correctly finds *no* registry entry and is *not* incorrectly rebound to a dead match —
the cleanup hook in Part 2 step 3 must run before this can be trusted, so verify the ordering, don't assume it.**
