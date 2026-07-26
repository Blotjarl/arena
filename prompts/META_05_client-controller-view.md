# Meta-Prompt 05 — Generate: Client Controller + View Package (9 prompts)

**Your job is to WRITE PROMPT FILES, not implement application code directly.**

**Owner of all nine generated prompts: Raj** (per `prompts/09-10_implementation_plan.md` §4's Owner
column — `packages/client` is Raj's SRS track). Each generated `.md` file must open with `**Owner: Raj.**`,
matching the format at `09_server_2_participant-state.md:3`.

### CRITICAL: read first, and confirm the real prerequisite
1. `prompts/00_master_context.md`
2. `prompts/09-10_implementation_plan.md`
3. `prompts/09_server_2_participant-state.md` — your quality/format bar (adapt its rigor to React
   components for the four view prompts — see note below).
4. **`packages/client`'s model package must be merged first** (`09_client_1`-`09_client_3`).

### Process (same for each of the nine prompts)
1. Read the actual current stub in `packages/client/src/`.
2. TDD: write tests first, implement, `npm run typecheck -w @arena/client` + `npx jest <file> --coverage`
   until green. Report real numbers.
3. Revert, confirm `git status` clean, write the prompt file.

**For the four view prompts (5-8)**: use **React Testing Library** (`@testing-library/react`, already a
devDependency from Step 2), not just Jest assertions on class internals. Tests should render the paired
screen function component and assert on rendered output / simulated interaction (`fireEvent` or
`userEvent`), not on implementation details. The `View`-implementing class itself (constructor,
`getModel`/`setModel`/`getController`/`setController`, `modelChanged`) still gets plain Jest unit tests —
both layers need coverage, they're testing different things.

---

Generate these 9 prompts:

1. `10_client_1_socket-connection-controller.md` — `SocketConnectionController` (owns the Socket.IO client
   connection; `operation()` emits outbound events; `bindInboundEvents()` routes inbound events to the
   matching model's `apply*`/`set*` method — mock the socket, don't open a real connection in tests, per
   the same testability principle the server side follows)
2. `10_client_2_lobby-controller.md` — `LobbyController.operation` (client-side length/non-empty check
   mirroring R1.1 as a UX precheck — the server still re-validates; don't imply the client check alone is
   sufficient)
3. `10_client_3_champion-select-controller.md` — `ChampionSelectController.operation`
4. `10_client_4_match-controller.md` — `MatchController.operation` (throttles/sends `match:action` for
   move/ability input)
5. `10_client_5_lobby-view.md` — `LobbyView` + `LobbyScreen` (username field, "Find Match", queue status —
   SRS 3.1.1)
6. `10_client_6_champion-select-view.md` — `ChampionSelectView` + `ChampionSelectScreen` (both players,
   countdown, roster with stats/abilities)
7. `10_client_7_match-hud-view.md` — `MatchHUDView` + `MatchHUDScreen` (health/resource bars, cooldown
   indicators, arena rendering via `InterpolationBuffer`)
8. `10_client_8_results-view.md` — `ResultsView` + `ResultsScreen` (outcome, reason, duration,
   return-to-queue — pairs with `LobbyController` per the documented gap-fill in `docs/01_class_list.md` §6c)
9. `10_client_9_client-main.md` — `ClientMain.main` (mounts the React root, wires the model/controller
   graph, renders the screen router — a smoke test that it mounts without throwing is enough, don't
   over-engineer this one)

---

### Verification and Git
Confirm `git status` shows only these 9 new `.md` files. Commit directly to `main` (`Add generated Step 10
prompts: client controller and view package`), push. Update `prompts/README.md`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Every view prompt must reiterate the master context §1.1 rule explicitly in its own text — the
client renders what the server sends and never computes an outcome. This is the single most-repeated rule
in this whole project for a reason; don't let it go unstated just because it's "obvious" by now.**
