# Prompt 10_server_3 — ChampionSelectController Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_server_2` (MatchmakingController) should be merged first — it's what actually constructs the
`MatchModel`/`MatchBroadcastView` pair this controller is bound to at runtime (via
`ConnectionHandler.bindMatch`, `10_server_6`). This prompt's own tests mock both, so it can be executed
independently, but the real object graph depends on `10_server_2`'s design.

---

### Design note: the `error` event this controller introduces
`docs/01_class_list.md` §5b already documents that `InvalidChampionSelectionError`/`SelectionWindowExpiredError`
are caught here and "forwarded to the view as an `error` payload" rather than surfaced to the socket
directly. The concrete shape used below — `{playerId, code, message}`, targeted at just the one player who
made the bad request — is new and must be consumed correctly by `MatchBroadcastView.modelChanged`
(`10_server_7`): that view strips `playerId` back out and emits only `{code, message}` (matching the wire
contract's `ErrorPayload`) to that one player's socket. `InvalidMatchPhaseError` is deliberately **not**
caught here — per the existing doc comment, a phase violation implies a misbehaving client, not a normal
validation failure, so it propagates for `ConnectionHandler` to turn into a generic error event instead.

---

### 1. Replace `packages/server/src/controller/ChampionSelectController.ts` with:

```ts
import {
  AbstractController,
  ModelEvent,
  InvalidChampionSelectionError,
  SelectionWindowExpiredError,
} from '@arena/shared';
import { MatchModel } from '../model/MatchModel';
import { MatchBroadcastView } from '../view/MatchBroadcastView';

/** Payload ConnectionHandler forwards for a `champion:select` request — the raw wire payload plus the connection's identified playerId (the wire event itself carries no playerId, see 10_server_6). */
export interface ChampionSelectRequest {
  playerId: string;
  championId: string;
}

/** Handles a player's champion choice during the CHAMPION_SELECT phase (R3.1–R3.5). */
export class ChampionSelectController extends AbstractController {
  constructor(model: MatchModel, view: MatchBroadcastView) {
    super(model, view);
  }

  /**
   * Dispatches a `champion:select` request to the underlying MatchModel.
   * @param action - the champion-select action, e.g. 'champion:select'
   * @param payload - the selecting player and chosen championId
   * @throws {InvalidMatchPhaseError} if the match is not currently in CHAMPION_SELECT — not caught here;
   * a phase violation implies a misbehaving client rather than a normal player-facing validation failure
   *
   * InvalidChampionSelectionError and SelectionWindowExpiredError (R3.2, R3.4) from
   * MatchModel.selectChampion() are caught here and forwarded to the view as a per-player `error` event
   * rather than left to propagate — mirrors the course's controller-catches/view-shows-popup pattern.
   */
  operation(action: string, payload?: ChampionSelectRequest): void {
    const match = this.model as MatchModel;
    const view = this.view as MatchBroadcastView;
    try {
      match.selectChampion(payload!.playerId, payload!.championId);
    } catch (err) {
      if (err instanceof InvalidChampionSelectionError || err instanceof SelectionWindowExpiredError) {
        view.modelChanged(
          new ModelEvent(match, 'error', { playerId: payload!.playerId, code: err.code, message: err.message }),
        );
        return;
      }
      throw err;
    }
  }
}
```

### 2. Create `packages/server/src/controller/ChampionSelectController.test.ts` with:

```ts
import { InvalidChampionSelectionError, SelectionWindowExpiredError, InvalidMatchPhaseError } from '@arena/shared';
import { ChampionSelectController } from './ChampionSelectController';
import type { MatchModel } from '../model/MatchModel';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';

function makeMatch(selectChampion: (playerId: string, championId: string) => void): MatchModel {
  return { id: 'm1', selectChampion: jest.fn(selectChampion) } as unknown as MatchModel;
}

function makeView(): MatchBroadcastView & { modelChanged: jest.Mock } {
  return { modelChanged: jest.fn() } as unknown as MatchBroadcastView & { modelChanged: jest.Mock };
}

describe('ChampionSelectController', () => {
  describe('operation', () => {
    it('delegates to MatchModel.selectChampion on success', () => {
      const match = makeMatch(() => {});
      const view = makeView();
      const controller = new ChampionSelectController(match, view);
      controller.operation('champion:select', { playerId: 'p1', championId: 'vex' });
      expect(match.selectChampion).toHaveBeenCalledWith('p1', 'vex');
      expect(view.modelChanged).not.toHaveBeenCalled();
    });

    it('catches InvalidChampionSelectionError and forwards a targeted error event to the view', () => {
      const match = makeMatch(() => {
        throw new InvalidChampionSelectionError('nope');
      });
      const view = makeView();
      const controller = new ChampionSelectController(match, view);
      expect(() => controller.operation('champion:select', { playerId: 'p1', championId: 'nope' })).not.toThrow();
      expect(view.modelChanged).toHaveBeenCalledTimes(1);
      const event = view.modelChanged.mock.calls[0][0];
      expect(event.type).toBe('error');
      expect(event.payload).toMatchObject({ playerId: 'p1', code: 'INVALID_CHAMPION_SELECTION' });
    });

    it('catches SelectionWindowExpiredError and forwards a targeted error event to the view', () => {
      const match = makeMatch(() => {
        throw new SelectionWindowExpiredError('m1');
      });
      const view = makeView();
      const controller = new ChampionSelectController(match, view);
      controller.operation('champion:select', { playerId: 'p1', championId: 'vex' });
      expect(view.modelChanged).toHaveBeenCalledTimes(1);
      expect(view.modelChanged.mock.calls[0][0].payload).toMatchObject({ code: 'SELECTION_WINDOW_EXPIRED' });
    });

    it('lets InvalidMatchPhaseError propagate uncaught (misbehaving client, not a normal validation failure)', () => {
      const match = makeMatch(() => {
        throw new InvalidMatchPhaseError('m1', 'CHAMPION_SELECT', 'ACTIVE');
      });
      const view = makeView();
      const controller = new ChampionSelectController(match, view);
      expect(() => controller.operation('champion:select', { playerId: 'p1', championId: 'vex' })).toThrow(
        InvalidMatchPhaseError,
      );
      expect(view.modelChanged).not.toHaveBeenCalled();
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest ChampionSelectController
--coverage --collectCoverageFrom="src/controller/ChampionSelectController.ts"` — validated result: **4 tests
passing, 100% statement/branch/function/line coverage**. Branch `server` from `main` (or reuse an
already-checked-out `server` branch), commit `Step 10: ChampionSelectController implementation and tests`,
push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: only `InvalidChampionSelectionError` and `SelectionWindowExpiredError` are caught here —
`InvalidMatchPhaseError` must propagate.** Catching it too would silently hide a real client/server phase
desync that `ConnectionHandler`'s generic error handling (`10_server_6`) needs to see.
