# Prompt 10_client_6 — ChampionSelectView + ChampionSelectScreen Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_client_3` (`ChampionSelectController`) must be merged first — this view dispatches through it.

### CRITICAL: master context §1.1 — the client renders, it never decides
The roster, opponent identity, and every champion's stats/abilities shown here are exactly what the server
sent on `match:found` — this component never invents or computes them, and never asserts that a selection
succeeded on its own. The on-screen countdown is a purely local, approximate UX timer: R3.4's actual
30-second deadline is enforced server-side by `MatchModel.selectChampion`, which this screen has no access
to and does not attempt to replicate. Reaching 0 locally changes nothing by itself — only a rejected
`champion:select` (surfaced as a wire `error` event, not handled by this component) or the server's own
phase transition does anything. Do not wire the local countdown to block the Select buttons or otherwise
imply it is authoritative.

### CRITICAL — the `notifyChanged` correction, applied here for ClientMatchModel
`10_client_5` fixed `ClientIdentityModel`/`ClientQueueModel`'s missing `notifyChanged()` calls. The same gap
exists on **all four** `ClientMatchModel.apply*()` methods (`09_client_2`, merged) — none of them notify
either. `ChampionSelectView` is the first of this batch's three `ClientMatchModel`-observing views
(`ChampionSelectView`, `MatchHUDView`, `ResultsView`), so this prompt fixes all four methods at once, not
just `applyChampionSelected`. `10_client_7` and `10_client_8` depend on this already being done — do not
redo it there, and do not skip it here just because *this* screen only reads `championSelection`.

---

### Design notes

**Three models, not one.** `docs/01_class_list.md` §6c's stated responsibility — "Both players, selection
countdown, roster with stats/abilities" — needs more than `ClientMatchModel`. The roster and opponent
username arrived earlier on `match:found` and live on `ClientQueueModel.matchPayload` (`09_client_1`), and
telling "my selection" apart from "the opponent's" needs this connection's own `playerId` from
`ClientIdentityModel`. Same pattern as `LobbyView` (`10_client_5`): `getModel()`/`setModel()` still resolve
to `ClientMatchModel`, matching `ChampionSelectController`'s `AbstractController<ClientMatchModel,
ChampionSelectView>` pairing; `ClientIdentityModel` and `ClientQueueModel` are reachable via extra accessor
pairs (`getIdentityModel`/`getQueueModel`), outside the formal `View<M,C>` contract.

**Distinguishing "you" from "the opponent."** `ChampionSelectedPayload` carries a `playerId` but no
"is this me" flag — this view computes it by comparing `match.championSelection.playerId` against
`identity.playerId`. If they match, this connection's own selection is highlighted and its Select buttons
disable (to prevent an obviously-redundant re-click, not because the server requires it — the server would
reject a double-selection attempt on its own via `InvalidChampionSelectionError`/uniqueness rules regardless
of whether this UI-only disable exists).

---

### 0. Correction to `packages/client/src/model/ClientMatchModel.ts` — add missing `notifyChanged` calls

Change the import and all four `apply*` method bodies:
```ts
import {
  AbstractModel, ModelEvent, MatchId, MatchPhase,
  ChampionSelectedPayload, MatchStartPayload, MatchStatePayload, MatchEndPayload,
} from '@arena/shared';
```
```ts
  applyChampionSelected(payload: ChampionSelectedPayload): void {
    this.championSelection = payload;
    // CORRECTION (Step 10, 10_client_6): none of this class's apply*() methods previously called
    // notifyChanged — see the identical correction and rationale on ClientIdentityModel.identify()
    // (10_client_5). ChampionSelectView is the first consumer that registers as a listener here.
    this.notifyChanged(new ModelEvent(this, 'championSelection:changed', payload));
  }
```
```ts
  applyMatchStart(payload: MatchStartPayload): void {
    this.matchId = payload.matchId;
    this.phase = MatchPhase.ACTIVE;
    this.latestState = payload.initialState;
    this.notifyChanged(new ModelEvent(this, 'matchStart', payload));
  }
```
```ts
  applyMatchState(payload: MatchStatePayload): void {
    this.latestState = payload;
    this.notifyChanged(new ModelEvent(this, 'matchState', payload));
  }
```
```ts
  applyMatchEnd(payload: MatchEndPayload): void {
    this.result = payload;
    this.notifyChanged(new ModelEvent(this, 'matchEnd', payload));
  }
```
(Everything else in the file — doc comments, field declarations — is unchanged.) Re-run
`npx jest ClientMatchModel` after this step — validated result: **8 tests passing, no test changes needed**
(the correction is purely additive).

### 1. Replace `packages/client/src/view/ChampionSelectView.tsx` with:

```tsx
import { useEffect, useReducer, useState } from 'react';
import { View, ModelListener, ModelEvent } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { ChampionSelectController } from '../controller/ChampionSelectController';

/** Selection window length in seconds — mirrors R3.4; a local UX countdown only, not authoritative. */
const SELECTION_WINDOW_SECONDS = 30;

/**
 * MVC View for the Champion Select screen. Observes ClientMatchModel for selection and phase
 * changes and notifies ChampionSelectScreen to re-render (SRS 3.1.1, R3.1–R3.5).
 */
export class ChampionSelectView implements View, ModelListener {
  /** Callback registered by ChampionSelectScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * CORRECTION (Step 10): the same gap LobbyView (10_client_5) closed applies here — "Both players,
   * selection countdown, roster with stats/abilities" (docs/01_class_list.md §6c) needs more than just
   * ClientMatchModel: the roster and opponent username arrived earlier via `match:found` and live on
   * ClientQueueModel.matchPayload, and telling "my selection" apart from "the opponent's" needs this
   * connection's own playerId from ClientIdentityModel. getModel()/setModel() still resolve to
   * ClientMatchModel, matching ChampionSelectController's `AbstractController<ClientMatchModel,
   * ChampionSelectView>` pairing; the other two models are reachable via extra accessors, same pattern
   * as LobbyView's getQueueModel().
   * @param identityModel - supplies this connection's own playerId, to distinguish "you" from the opponent
   * @param model - the match model this view observes for champion-select phase state
   * @param queueModel - supplies the roster and opponent username carried on the earlier match:found event
   * @param controller - the controller this view dispatches selection actions through
   */
  constructor(
    private identityModel: ClientIdentityModel,
    private model: ClientMatchModel,
    private queueModel: ClientQueueModel,
    private controller: ChampionSelectController,
  ) {
    this.identityModel.addModelListener(this);
    this.model.addModelListener(this);
    this.queueModel.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * @param callback - called with no arguments whenever any observed model changes
   */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Returns the observed match model.
   * @returns the current ClientMatchModel
   */
  getModel(): ClientMatchModel {
    return this.model;
  }

  /**
   * Replaces the observed model reference. Unlike the constructor, this does not re-register the
   * view as a listener on the new model — call `model.addModelListener(this)` separately if needed.
   * @param model - the new ClientMatchModel to observe
   */
  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  /**
   * Returns the observed identity model (CORRECTION, Step 10 — see constructor doc above).
   * @returns the current ClientIdentityModel
   */
  getIdentityModel(): ClientIdentityModel {
    return this.identityModel;
  }

  /**
   * Replaces the observed identity model reference. Does not re-register as a listener.
   * @param identityModel - the new ClientIdentityModel to observe
   */
  setIdentityModel(identityModel: ClientIdentityModel): void {
    this.identityModel = identityModel;
  }

  /**
   * Returns the observed queue model (CORRECTION, Step 10 — see constructor doc above).
   * @returns the current ClientQueueModel
   */
  getQueueModel(): ClientQueueModel {
    return this.queueModel;
  }

  /**
   * Replaces the observed queue model reference. Does not re-register as a listener.
   * @param queueModel - the new ClientQueueModel to observe
   */
  setQueueModel(queueModel: ClientQueueModel): void {
    this.queueModel = queueModel;
  }

  /**
   * Returns the controller used to dispatch selection actions.
   * @returns the current ChampionSelectController
   */
  getController(): ChampionSelectController {
    return this.controller;
  }

  /**
   * Replaces the controller used to dispatch selection actions.
   * @param controller - the new ChampionSelectController
   */
  setController(controller: ChampionSelectController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when any observed model fires a change event.
   * Invokes the registered onUpdate callback to trigger a React re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    this.onUpdate?.();
  }
}

/**
 * Both players, selection countdown, roster with stats/abilities (SRS 3.1.1).
 *
 * CRITICAL (master context §1.1): the roster, opponent identity, and every champion's stats/abilities
 * shown here are exactly what the server sent on `match:found` — this component never invents or
 * computes them. The on-screen countdown is a purely local, approximate UX timer (R3.4 is enforced
 * server-side by MatchModel.selectChampion's 30-second deadline check, which this screen has no access
 * to and does not attempt to replicate); reaching 0 here changes nothing by itself — only a rejected
 * `champion:select` (surfaced as a wire `error` event) or the server's own phase transition does.
 */
export function ChampionSelectScreen(props: { view: ChampionSelectView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const [secondsLeft, setSecondsLeft] = useState(SELECTION_WINDOW_SECONDS);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const identity = view.getIdentityModel();
  const match = view.getModel();
  const queue = view.getQueueModel();
  const controller = view.getController();

  const roster = queue.matchPayload?.roster ?? [];
  const opponentUsername = queue.matchPayload?.opponentUsername ?? 'Opponent';
  const mySelection =
    match.championSelection && match.championSelection.playerId === identity.playerId
      ? match.championSelection
      : null;
  const bothSelected = match.championSelection?.bothSelected ?? false;

  return (
    <div>
      <p>Selection window: {secondsLeft}s</p>
      <p>You: {identity.username}</p>
      <p>Opponent: {opponentUsername}</p>
      {mySelection && <p>You selected: {mySelection.championId}</p>}
      {bothSelected && <p>Both players ready</p>}
      <ul aria-label="champion-roster">
        {roster.map((champion) => (
          <li key={champion.id}>
            <span>
              {champion.name} — {champion.role} (HP {champion.maxHealth})
            </span>
            <ul>
              {champion.abilities.map((ability) => (
                <li key={ability.id}>{ability.name}</li>
              ))}
            </ul>
            <button
              onClick={() => controller.operation('selectChampion', { championId: champion.id })}
              disabled={mySelection !== null}
            >
              Select {champion.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 2. Create `packages/client/src/view/__tests__/ChampionSelectView.test.ts` with:

```ts
import { ModelEvent } from '@arena/shared';
import { ChampionSelectView } from '../ChampionSelectView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { ChampionSelectController } from '../../controller/ChampionSelectController';

function makeController(): ChampionSelectController {
  return { operation: jest.fn() } as unknown as ChampionSelectController;
}

describe('ChampionSelectView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the identity, match, and queue models', () => {
      const identity = new ClientIdentityModel();
      const match = new ClientMatchModel();
      const queue = new ClientQueueModel();
      const identitySpy = jest.spyOn(identity, 'addModelListener');
      const matchSpy = jest.spyOn(match, 'addModelListener');
      const queueSpy = jest.spyOn(queue, 'addModelListener');

      const view = new ChampionSelectView(identity, match, queue, makeController());

      expect(identitySpy).toHaveBeenCalledWith(view);
      expect(matchSpy).toHaveBeenCalledWith(view);
      expect(queueSpy).toHaveBeenCalledWith(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the observed match model', () => {
      const match = new ClientMatchModel();
      const view = new ChampionSelectView(new ClientIdentityModel(), match, new ClientQueueModel(), makeController());
      expect(view.getModel()).toBe(match);

      const other = new ClientMatchModel();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('getIdentityModel / setIdentityModel', () => {
    it('returns and replaces the observed identity model', () => {
      const identity = new ClientIdentityModel();
      const view = new ChampionSelectView(identity, new ClientMatchModel(), new ClientQueueModel(), makeController());
      expect(view.getIdentityModel()).toBe(identity);

      const other = new ClientIdentityModel();
      view.setIdentityModel(other);
      expect(view.getIdentityModel()).toBe(other);
    });
  });

  describe('getQueueModel / setQueueModel', () => {
    it('returns and replaces the observed queue model', () => {
      const queue = new ClientQueueModel();
      const view = new ChampionSelectView(new ClientIdentityModel(), new ClientMatchModel(), queue, makeController());
      expect(view.getQueueModel()).toBe(queue);

      const other = new ClientQueueModel();
      view.setQueueModel(other);
      expect(view.getQueueModel()).toBe(other);
    });
  });

  describe('getController / setController', () => {
    it('returns and replaces the controller', () => {
      const controller = makeController();
      const view = new ChampionSelectView(
        new ClientIdentityModel(),
        new ClientMatchModel(),
        new ClientQueueModel(),
        controller,
      );
      expect(view.getController()).toBe(controller);

      const other = makeController();
      view.setController(other);
      expect(view.getController()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it('invokes the bound update callback', () => {
      const match = new ClientMatchModel();
      const view = new ChampionSelectView(new ClientIdentityModel(), match, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      view.modelChanged(new ModelEvent(match, 'championSelection:changed', {}));

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CRITICAL CHECKPOINT: firing match.applyChampionSelected() actually reaches the bound callback end-to-end', () => {
      const match = new ClientMatchModel();
      const view = new ChampionSelectView(new ClientIdentityModel(), match, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      match.applyChampionSelected({ matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: false });

      expect(callback).toHaveBeenCalled();
    });
  });
});
```

### 3. Create `packages/client/src/view/__tests__/ChampionSelectScreen.test.tsx` with:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Team, Champion, Ability, EffectType } from '@arena/shared';
import { ChampionSelectView, ChampionSelectScreen } from '../ChampionSelectView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { ChampionSelectController } from '../../controller/ChampionSelectController';

function makeRoster(): Champion[] {
  return [
    new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 10, 200, [
      new Ability('bolt', 'Arcane Bolt', 5, 20, 500, EffectType.DAMAGE, 30),
    ]),
    new Champion('korr', 'Korr', 'Bruiser / Control', 180, 100, 8, 150, [
      new Ability('crush', 'Crushing Blow', 3, 15, 80, EffectType.DAMAGE, 25),
    ]),
  ];
}

function makeQueueWithRoster(): ClientQueueModel {
  const queue = new ClientQueueModel();
  queue.setMatched({ matchId: 'm1', team: Team.A, opponentUsername: 'Bob', roster: makeRoster() });
  return queue;
}

function makeMockController(): ChampionSelectController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as ChampionSelectController & { operation: jest.Mock };
}

describe('ChampionSelectScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders both players and the roster with names, roles, and abilities', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    const view = new ChampionSelectView(identity, new ClientMatchModel(), makeQueueWithRoster(), makeMockController());

    render(<ChampionSelectScreen view={view} />);

    expect(screen.getByText(/You: Raj/)).toBeTruthy();
    expect(screen.getByText(/Opponent: Bob/)).toBeTruthy();
    expect(screen.getByText(/Vex — Ranged Burst Mage/)).toBeTruthy();
    expect(screen.getByText(/Korr — Bruiser \/ Control/)).toBeTruthy();
    expect(screen.getByText('Arcane Bolt')).toBeTruthy();
    expect(screen.getByText('Crushing Blow')).toBeTruthy();
  });

  it('clicking Select forwards selectChampion with the chosen championId', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    const controller = makeMockController();
    const view = new ChampionSelectView(identity, new ClientMatchModel(), makeQueueWithRoster(), controller);

    render(<ChampionSelectScreen view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Vex' }));

    expect(controller.operation).toHaveBeenCalledWith('selectChampion', { championId: 'vex' });
  });

  it('CRITICAL CHECKPOINT: shows my own selection (matched on playerId) and disables further selection, via the real notifyChanged pipeline', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    const controller = makeMockController();
    const view = new ChampionSelectView(identity, match, makeQueueWithRoster(), controller);

    render(<ChampionSelectScreen view={view} />);
    expect(screen.queryByText(/You selected/)).toBeNull();

    act(() => {
      match.applyChampionSelected({ matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: false });
    });

    expect(screen.getByText(/You selected: vex/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select Vex' })).toHaveProperty('disabled', true);
  });

  it('does not treat the opponent selecting as "my" selection', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    match.applyChampionSelected({ matchId: 'm1', playerId: 'p2', championId: 'korr', bothSelected: false });
    const view = new ChampionSelectView(identity, match, makeQueueWithRoster(), makeMockController());

    render(<ChampionSelectScreen view={view} />);

    expect(screen.queryByText(/You selected/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Select Vex' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows "Both players ready" once bothSelected is true', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    match.applyChampionSelected({ matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: true });
    const view = new ChampionSelectView(identity, match, makeQueueWithRoster(), makeMockController());

    render(<ChampionSelectScreen view={view} />);

    expect(screen.getByText('Both players ready')).toBeTruthy();
  });

  it('CRITICAL CHECKPOINT: the local countdown ticks down once per second and never goes below zero', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    const view = new ChampionSelectView(identity, new ClientMatchModel(), makeQueueWithRoster(), makeMockController());

    render(<ChampionSelectScreen view={view} />);
    expect(screen.getByText('Selection window: 30s')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Selection window: 25s')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(screen.getByText('Selection window: 0s')).toBeTruthy();
  });
});
```

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes; `npx jest ChampionSelectView
ChampionSelectScreen --coverage --collectCoverageFrom="src/view/ChampionSelectView.tsx"` — validated
result: **13 tests passing (7 + 6 across the two files), 100% statement/function/line coverage, 85.71%
branch coverage** (the uncovered branches are `queue.matchPayload?.roster ?? []` and `?? 'Opponent'`
returning their fallback — unreachable given this screen only mounts after `match:found` has populated
`matchPayload`, a defensive guard, not a real code path). Also re-run `npx jest ClientMatchModel` after
step 0 — validated result: **8 tests passing, no test changes needed**. Then run the full client suite
(`npx jest -w @arena/client`) — validated result: **42 tests passing across 6 suites**. Branch `client`
from `main` (or reuse an already-checked-out `client` branch), commit `Step 10: ChampionSelectView +
ChampionSelectScreen implementation and tests, ClientMatchModel notifyChanged correction`, push, open a PR
into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: the client renders what the server sends and never computes an outcome (master context §1.1).**
The roster, both players' identities, and the current selection state all come from the server; this
screen's only invented value is a cosmetic countdown number that has zero effect on gameplay. **Also do not
skip or duplicate the `notifyChanged` correction in step 0** — it must land exactly once, here, covering
all four `ClientMatchModel.apply*()` methods, since `10_client_7` (`MatchHUDView`) and `10_client_8`
(`ResultsView`) both depend on it already being in place and will not repeat it.
