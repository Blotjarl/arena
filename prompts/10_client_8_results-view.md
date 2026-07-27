# Prompt 10_client_8 — ResultsView + ResultsScreen Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_client_2` (`LobbyController`) and `10_client_6` (which lands the `ClientMatchModel.notifyChanged`
correction) must both be merged first. **Do not repeat the `notifyChanged` correction here** — `10_client_6`
already applied it to all four `apply*` methods; this prompt only depends on `applyMatchEnd`'s half of it.

### CRITICAL: master context §1.1 — "Victory"/"Defeat"/"Draw" is a label, not a decision
This screen computes the win/loss/draw label by comparing two facts the server already supplied —
`MatchEndPayload.winningTeam` and this connection's own team from the earlier `match:found` payload — it
never decides who won. If both are server-supplied and consistent, the label is just a readable rendering
of a comparison; this component must never independently determine an outcome (e.g. from health values it
happens to have seen, or by racing ahead of a `match:end` event that hasn't arrived yet).

---

### Design notes

**Two models, for the same reason as every other view in this batch.** Classifying the result as
Victory/Defeat/Draw needs this connection's own team, which lives on `ClientQueueModel.matchPayload.team`
(set back at `match:found`), not on `ClientMatchModel`. `getModel()`/`setModel()` resolve to
`ClientMatchModel`; `ClientQueueModel` is reachable via a `getQueueModel()` accessor outside the formal
`View<M,C>` contract — same pattern as `LobbyView`, `ChampionSelectView`, and `MatchHUDView`.

**`ResultsView` pairs with `LobbyController`, not a dedicated controller — this is intentional, documented
in two places already.** `docs/01_class_list.md` §6c's own note explains "return to queue" is a lobby
action, and `LobbyController.operation` (`10_client_2`) already implements a `'returnToQueue'` case that
behaves identically to `'joinQueue'`. This view's `getController()` return type is `LobbyController`, not
some `ResultsController` that doesn't exist in the class list — do not invent one.

**Type note on the `View<M,C>` generic vs. the `LobbyController` pairing.** `LobbyController extends
AbstractController<ClientIdentityModel, LobbyView>` — its own `Controller<M,V>` type parameters are fixed
to `(ClientIdentityModel, LobbyView)`, not `(ClientMatchModel, ResultsView)`. This is fine and compiles
cleanly: like every other view class in this codebase, `ResultsView implements View, ModelListener` uses no
explicit generic type arguments (the stub was already written this way), so there is no compile-time
constraint tying `getController()`'s return type to `getModel()`'s. Don't try to "fix" this by parameterizing
`View<ClientMatchModel, LobbyController>` — that would fail to compile, since `LobbyController` does not
extend `Controller<ClientMatchModel, any>`.

---

### 1. Replace `packages/client/src/view/ResultsView.tsx` with:

```tsx
import { useEffect, useReducer } from 'react';
import { View, ModelListener, ModelEvent, EndReason } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { LobbyController } from '../controller/LobbyController';

/** Human-readable label for each EndReason (R5.1–R5.3). */
const END_REASON_LABELS: Record<EndReason, string> = {
  [EndReason.ELIMINATION]: 'Elimination',
  [EndReason.TIME_LIMIT]: 'Time limit reached',
  [EndReason.DISCONNECT_FORFEIT]: 'Opponent disconnected',
  [EndReason.SELECTION_TIMEOUT]: 'Champion selection timed out',
};

/**
 * MVC View for the post-match Results screen. Observes ClientMatchModel for the final result
 * payload and re-renders when it arrives (SRS 3.1.1, R5.1–R5.3).
 * Pairs with LobbyController because "Return to queue" is a lobby action — no dedicated results
 * controller is specified in docs/01_class_list.md §6c.
 */
export class ResultsView implements View, ModelListener {
  /** Callback registered by ResultsScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * CORRECTION (Step 10): same pattern as the other views in this batch — knowing whether the local
   * player won or lost needs this connection's own team assignment, which arrived on the earlier
   * `match:found` event and lives on ClientQueueModel.matchPayload.team, not on ClientMatchModel.
   * getModel()/setModel() still resolve to ClientMatchModel; queueModel is reachable via a separate
   * getQueueModel() accessor, outside the formal View<M,C> contract.
   * @param model - the match model this view observes for the final result
   * @param queueModel - supplies this connection's own team, to classify the result as win/loss/draw
   * @param controller - the lobby controller used to dispatch "return to queue" actions
   */
  constructor(
    private model: ClientMatchModel,
    private queueModel: ClientQueueModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * @param callback - called with no arguments whenever the model changes
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
   * Returns the lobby controller used to dispatch return-to-queue actions.
   * @returns the current LobbyController
   */
  getController(): LobbyController {
    return this.controller;
  }

  /**
   * Replaces the controller used to dispatch return-to-queue actions.
   * @param controller - the new LobbyController
   */
  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when the match model fires a change event (typically when
   * applyMatchEnd sets the result). Invokes the registered onUpdate callback to re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    this.onUpdate?.();
  }
}

/**
 * Outcome, reason, duration, return-to-queue control (SRS 3.1.1).
 *
 * CRITICAL (master context §1.1): "Victory"/"Defeat"/"Draw" is computed by comparing the server's
 * own `winningTeam` (from `MatchEndPayload`) against this connection's own team (from the earlier
 * `match:found` payload) — both server-supplied facts. This screen never decides who won; it only
 * labels a decision the server already made.
 */
export function ResultsScreen(props: { view: ResultsView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  const match = view.getModel();
  const queue = view.getQueueModel();
  const controller = view.getController();

  const result = match.result;
  if (!result) {
    return <p>Waiting for match result...</p>;
  }

  const myTeam = queue.matchPayload?.team ?? null;
  const outcome = result.winningTeam === null ? 'Draw' : result.winningTeam === myTeam ? 'Victory' : 'Defeat';

  return (
    <div>
      <h2>{outcome}</h2>
      <p>Reason: {END_REASON_LABELS[result.reason]}</p>
      <p>Duration: {(result.durationMs / 1000).toFixed(1)}s</p>
      <button onClick={() => controller.operation('returnToQueue')}>Return to Queue</button>
    </div>
  );
}
```

### 2. Create `packages/client/src/view/__tests__/ResultsView.test.ts` with:

```ts
import { ModelEvent, EndReason } from '@arena/shared';
import { ResultsView } from '../ResultsView';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { LobbyController } from '../../controller/LobbyController';

function makeController(): LobbyController {
  return { operation: jest.fn() } as unknown as LobbyController;
}

describe('ResultsView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the match model', () => {
      const match = new ClientMatchModel();
      const addSpy = jest.spyOn(match, 'addModelListener');

      const view = new ResultsView(match, new ClientQueueModel(), makeController());

      expect(addSpy).toHaveBeenCalledWith(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the observed match model', () => {
      const match = new ClientMatchModel();
      const view = new ResultsView(match, new ClientQueueModel(), makeController());
      expect(view.getModel()).toBe(match);

      const other = new ClientMatchModel();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('getQueueModel / setQueueModel', () => {
    it('returns and replaces the observed queue model', () => {
      const queue = new ClientQueueModel();
      const view = new ResultsView(new ClientMatchModel(), queue, makeController());
      expect(view.getQueueModel()).toBe(queue);

      const other = new ClientQueueModel();
      view.setQueueModel(other);
      expect(view.getQueueModel()).toBe(other);
    });
  });

  describe('getController / setController', () => {
    it('returns and replaces the controller', () => {
      const controller = makeController();
      const view = new ResultsView(new ClientMatchModel(), new ClientQueueModel(), controller);
      expect(view.getController()).toBe(controller);

      const other = makeController();
      view.setController(other);
      expect(view.getController()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it('invokes the bound update callback', () => {
      const match = new ClientMatchModel();
      const view = new ResultsView(match, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      view.modelChanged(new ModelEvent(match, 'matchEnd', {}));

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CRITICAL CHECKPOINT: firing match.applyMatchEnd() actually reaches the bound callback end-to-end', () => {
      const match = new ClientMatchModel();
      const view = new ResultsView(match, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      match.applyMatchEnd({ matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: null, durationMs: 1000 });

      expect(callback).toHaveBeenCalled();
    });
  });
});
```

### 3. Create `packages/client/src/view/__tests__/ResultsScreen.test.tsx` with:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Team, EndReason } from '@arena/shared';
import { ResultsView, ResultsScreen } from '../ResultsView';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { LobbyController } from '../../controller/LobbyController';

function makeMockController(): LobbyController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as LobbyController & { operation: jest.Mock };
}

function makeQueueOnTeam(team: Team): ClientQueueModel {
  const queue = new ClientQueueModel();
  queue.setMatched({ matchId: 'm1', team, opponentUsername: 'Bob', roster: [] });
  return queue;
}

describe('ResultsScreen', () => {
  it('shows a waiting message before match:end arrives', () => {
    const view = new ResultsView(new ClientMatchModel(), new ClientQueueModel(), makeMockController());
    render(<ResultsScreen view={view} />);
    expect(screen.getByText(/Waiting for match result/)).toBeTruthy();
  });

  it('shows Victory when the winning team matches my own team', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 42000 });
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());

    render(<ResultsScreen view={view} />);

    expect(screen.getByText('Victory')).toBeTruthy();
    expect(screen.getByText(/Reason: Elimination/)).toBeTruthy();
    expect(screen.getByText(/Duration: 42.0s/)).toBeTruthy();
  });

  it('shows Defeat when the winning team is the opponent', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.TIME_LIMIT, winningTeam: Team.B, durationMs: 300000 });
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());

    render(<ResultsScreen view={view} />);

    expect(screen.getByText('Defeat')).toBeTruthy();
    expect(screen.getByText(/Reason: Time limit reached/)).toBeTruthy();
  });

  it('shows Draw when winningTeam is null', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.TIME_LIMIT, winningTeam: null, durationMs: 300000 });
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());

    render(<ResultsScreen view={view} />);

    expect(screen.getByText('Draw')).toBeTruthy();
  });

  it('shows the disconnect-forfeit and selection-timeout reason labels', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.DISCONNECT_FORFEIT, winningTeam: Team.A, durationMs: 1000 });
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());
    render(<ResultsScreen view={view} />);
    expect(screen.getByText(/Reason: Opponent disconnected/)).toBeTruthy();
  });

  it('clicking Return to Queue dispatches returnToQueue on the (Lobby) controller', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 1000 });
    const controller = makeMockController();
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), controller);

    render(<ResultsScreen view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Queue' }));

    expect(controller.operation).toHaveBeenCalledWith('returnToQueue');
  });

  it('CRITICAL CHECKPOINT: a match:end delivered after mount re-renders in place via the real notifyChanged pipeline', () => {
    const match = new ClientMatchModel();
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());

    render(<ResultsScreen view={view} />);
    expect(screen.getByText(/Waiting for match result/)).toBeTruthy();

    act(() => {
      match.applyMatchEnd({ matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 5000 });
    });

    expect(screen.getByText('Victory')).toBeTruthy();
  });
});
```

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes; `npx jest ResultsView
ResultsScreen --coverage --collectCoverageFrom="src/view/ResultsView.tsx"` — validated result: **13 tests
passing (6 + 7 across the two files), 100% statement/function/line coverage, 85.71% branch coverage** (the
one uncovered branch is `queue.matchPayload?.team ?? null` returning the fallback — unreachable given this
screen only mounts after `match:found` has populated `matchPayload`, a defensive guard, not a real code
path). Then run the full client suite (`npx jest -w @arena/client`) — validated result: **42 tests passing
across 6 suites**. Branch `client` from `main` (or reuse an already-checked-out `client` branch), commit
`Step 10: ResultsView + ResultsScreen implementation and tests`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: the client renders what the server sends and never computes an outcome (master context §1.1).**
Victory/Defeat/Draw is a label over two server-supplied facts (`winningTeam`, this connection's own
`team`), not an independent judgment — this screen must never derive an outcome from any other signal (e.g.
health values, elapsed time) even if it happens to have seen them earlier in the match.
