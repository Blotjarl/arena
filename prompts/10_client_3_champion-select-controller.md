# Prompt 10_client_3 — ChampionSelectController Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_client_1` (`SocketConnectionController`) must be merged first — this controller has nothing to actually
emit through without it.

### CRITICAL: this controller never asserts a selection outcome
Per master context §1.1, the client renders what the server sends and never computes an outcome itself.
`ChampionSelectController.operation` unconditionally forwards the request — it does not (and must not)
mutate `ClientMatchModel.championSelection` itself, does not pre-check champion uniqueness, and does not
enforce the 30-second selection window (R3.4). Only the server-driven `champion:selected` event, routed
through `SocketConnectionController` into `ClientMatchModel.applyChampionSelected` (`10_client_1`, already
implemented), is allowed to change that field. A rejected selection surfaces as a wire `error` event, which
this controller does not handle — that is the paired `ChampionSelectView`'s job in a later prompt.

---

### Design note — the now-familiar SocketConnectionController gap

Same correction as `10_client_2` (`LobbyController`): `docs/01_class_list.md` §6b's constructor sketch only
documents the inherited `AbstractController` `(model, view)` shape, but this controller needs a
`SocketConnectionController` reference to actually emit `champion:select`. Add it as a third constructor
parameter, matching the pattern now established by `10_client_2`.

The outbound payload shape is just `{ championId }` — confirmed against the server's already-implemented
`ConnectionHandler.register()` (`10_server_6`, merged), which listens for `champion:select` with exactly
`(payload: { championId: string })` and injects the connection's own `playerId` server-side. This client
controller must not send a `playerId` itself; the server already knows who's asking.

---

### 1. Replace `packages/client/src/controller/ChampionSelectController.ts` with:

```ts
import { AbstractController, SOCKET_EVENTS, ChampionId } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { ChampionSelectView } from '../view/ChampionSelectView';
import { SocketConnectionController } from './SocketConnectionController';

/**
 * Handles the player's champion selection during the CHAMPION_SELECT phase (R3.1–R3.5).
 * Forwards the chosen champion to the server; the server validates availability and timing.
 */
export class ChampionSelectController extends AbstractController<ClientMatchModel, ChampionSelectView> {
  /**
   * CORRECTION (Step 10): as with LobbyController (10_client_2), this controller needs a
   * SocketConnectionController reference to actually emit anything — docs/01_class_list.md §6b's
   * constructor sketch only documents the inherited (model, view) shape.
   * @param model - the match model this controller reads from (not mutated here — the server, via
   *   `champion:selected`, is the only thing that ever updates it)
   * @param view - the paired ChampionSelectView
   * @param socketController - used to emit `champion:select` to the server
   */
  constructor(
    model: ClientMatchModel,
    view: ChampionSelectView,
    private readonly socketController: SocketConnectionController,
  ) {
    super(model, view);
  }

  /**
   * Dispatches a champion-select action (e.g. 'selectChampion').
   * The server enforces the 30-second selection window (R3.4) and champion uniqueness (R3.2);
   * this controller does not enforce those constraints — it forwards the request unconditionally and
   * lets the resulting `champion:selected` broadcast or `error` event (relayed onto ClientMatchModel /
   * surfaced by the view) reflect the outcome.
   * @param action - the champion-select action to dispatch
   * @param payload - for 'selectChampion', the chosen champion's identifier
   */
  operation(action: string, payload?: { championId: ChampionId }): void {
    if (action !== 'selectChampion' || !payload) return;
    this.socketController.operation(SOCKET_EVENTS.CHAMPION_SELECT, { championId: payload.championId });
  }
}
```

### 2. Create `packages/client/src/controller/ChampionSelectController.test.ts` with:

```ts
import { ChampionSelectController } from './ChampionSelectController';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { ChampionSelectView } from '../view/ChampionSelectView';
import type { SocketConnectionController } from './SocketConnectionController';

function makeSocketController(): SocketConnectionController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as SocketConnectionController & { operation: jest.Mock };
}

function makeView(): ChampionSelectView {
  return {} as unknown as ChampionSelectView;
}

describe('ChampionSelectController', () => {
  describe('selectChampion', () => {
    it('forwards champion:select with the chosen championId', () => {
      const socketController = makeSocketController();
      const controller = new ChampionSelectController(new ClientMatchModel(), makeView(), socketController);

      controller.operation('selectChampion', { championId: 'vex' });

      expect(socketController.operation).toHaveBeenCalledWith('champion:select', { championId: 'vex' });
    });

    it('does not mutate the model itself — only the server-driven champion:selected event does that', () => {
      const model = new ClientMatchModel();
      const controller = new ChampionSelectController(model, makeView(), makeSocketController());

      controller.operation('selectChampion', { championId: 'korr' });

      expect(model.championSelection).toBeNull();
    });

    it('does nothing when payload is omitted', () => {
      const socketController = makeSocketController();
      const controller = new ChampionSelectController(new ClientMatchModel(), makeView(), socketController);

      controller.operation('selectChampion');

      expect(socketController.operation).not.toHaveBeenCalled();
    });
  });

  describe('unrecognized action', () => {
    it('does nothing and does not throw', () => {
      const socketController = makeSocketController();
      const controller = new ChampionSelectController(new ClientMatchModel(), makeView(), socketController);

      expect(() => controller.operation('nonsense', { championId: 'rin' })).not.toThrow();
      expect(socketController.operation).not.toHaveBeenCalled();
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes; `npx jest
ChampionSelectController --coverage --collectCoverageFrom="src/controller/ChampionSelectController.ts"` —
validated result: **4 tests passing, 100% statement/branch/function/line coverage**. Branch `client` from
`main` (or reuse an already-checked-out `client` branch), commit `Step 10: ChampionSelectController
implementation and tests`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this controller must never write to `ClientMatchModel` itself.** Only the server-pushed
`champion:selected` event (already wired in `10_client_1`) is allowed to populate
`championSelection` — verified above by the test asserting the model is untouched after `operation()`.
Per master context §1.1: the client renders what the server sends and never computes an outcome.
