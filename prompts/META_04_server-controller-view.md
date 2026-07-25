# Meta-Prompt 04 — Generate: Server Controller + View Package (8 prompts)

**Your job is to WRITE PROMPT FILES, not implement application code directly.**

### CRITICAL: read first, and confirm the real prerequisite
1. `prompts/00_master_context.md`
2. `prompts/09-10_implementation_plan.md`
3. `prompts/09_server_2_participant-state.md` — your quality/format bar.
4. **`packages/server`'s entire model package must be merged to `main` first** — `09_server_1` through
   `09_server_6` (matchmaking, participant state, match model, tick loop) all need to be real, not stubs,
   since every controller you're generating here calls into them. Check `git log` before starting.

### Process (same for each of the eight prompts)
1. Read the actual current stub in `packages/server/src/`.
2. TDD: write tests first (mocking the model classes, not a live socket — 3.6.4), implement, `npm run
   typecheck -w @arena/server` + `npx jest <file> --coverage` until green. Report real numbers.
3. Revert, confirm `git status` clean, write the prompt file.

Controllers dispatch via `operation(action, payload)` (the Calculator/AccountManager pattern, already
established by every `AbstractController` subclass in this codebase) — a switch/if-else over `action`,
delegating to the model and catching its exceptions to hand to the view. Match each controller's exception
handling to what its `AbstractController`-realizing class in `docs/01_class_list.md` §5b already documents.

---

Generate these 8 prompts (each targets the listed file(s)):

1. `10_server_1_player-identify-controller.md` — `PlayerIdentifyController.operation` (R1.1-R1.4)
2. `10_server_2_matchmaking-controller.md` — `MatchmakingController.operation` (R2.1-R2.6; on pairing,
   constructs a `MatchModel` + registers it with the running `TickLoop`)
3. `10_server_3_champion-select-controller.md` — `ChampionSelectController.operation` (catches
   `InvalidChampionSelectionError`/`SelectionWindowExpiredError`, asks the view to emit an `error` event —
   never surfaces the raw exception to the socket)
4. `10_server_4_combat-controller.md` — `CombatController.operation` (R4.1-R4.2; validation failures are
   swallowed per spec, not surfaced — matches `MatchModel.submitAbility`'s own silent-ignore behavior)
5. `10_server_5_disconnect-controller.md` — `DisconnectController.operation` (R6.1-R6.4; owns nothing new
   beyond calling `MatchModel.disconnect`/`reconnect` and handling `GracePeriodExpiredError`)
6. `10_server_6_connection-and-reporting.md` — `ConnectionHandler.register` (binds every inbound
   `SOCKET_EVENTS` name to the matching controller's `operation()`) + `MatchReportingClient.reportMatchBegin`/
   `reportMatchEnd` (real HTTP POST to the api's internal endpoints — use Node's built-in `fetch`; log and
   swallow failures per R7.4, never throw into match simulation — test this specifically: a failing HTTP
   call must not propagate)
7. `10_server_7_broadcast-views.md` — `MatchmakingBroadcastView.modelChanged` + `MatchBroadcastView.modelChanged`
   (switch on `event.type`, emit the matching Socket.IO event with the matching contract payload type —
   see `packages/shared/src/contract/events.ts` for the full event→payload mapping)
8. `10_server_8_server-main.md` — `ServerMain.main` (creates the HTTP+Socket.IO server, the singleton
   `MatchmakingQueue`, starts `TickLoop`, wires a `ConnectionHandler` per connection; a real unit test isn't
   very meaningful for a wiring/bootstrap method — a smoke test that `main()` doesn't throw when called
   with a free port is enough, don't over-engineer this one)

---

### Verification and Git
Confirm `git status` shows only these 8 new `.md` files. Commit directly to `main` (`Add generated Step 10
prompts: server controller and view package`), push. Update `prompts/README.md`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `10_server_2` (MatchmakingController) is the one place a new `MatchModel` gets constructed and
registered with `TickLoop` — get its test coverage of that wiring right, since nothing else in this batch
exercises it.**
