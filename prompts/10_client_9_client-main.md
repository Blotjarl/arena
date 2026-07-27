# Prompt 10_client_9 — ClientMain Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
All eight prior `10_client_*` prompts must be merged first — this is the wiring prompt that constructs and
connects every model, controller, and view built in this batch. Per `prompts/09-10_implementation_plan.md`
§4's own note on Step 10: this is a thin wiring/entry-point prompt, not an algorithmic one — **a smoke test
that it mounts without throwing is enough; do not over-engineer it.** The test suite below goes slightly
beyond a bare smoke test (one integration-style transition test) but deliberately stops there — do not add
exhaustive routing coverage for every screen combination.

### CRITICAL: master context §1.1 — the router labels state, it doesn't invent it
The top-level screen router (`AppRouter`, defined in this same file) decides which of the four screens to
show purely by reading state already established by the server via the models this batch's views observe —
`identityModel.username`, `queueModel.status`, `matchModel.phase`, `matchModel.result`. It introduces no new
authoritative facts of its own; it is the single place that translates "what the server has told us so far"
into "which screen the SRS 3.1.1 flow says we should be on."

---

### Design notes

**Breaking the View↔Controller circular constructor dependency.** Every controller in this batch takes its
paired view in its constructor, and every view takes its paired controller in its constructor —
`docs/01_class_list.md`'s `AbstractController`/`View` pattern requires both, but neither can be built first
without the other already existing. This is exactly what `View.setController()`/`Controller.setView()`
exist for (the framework doc, §1 of the class list, already documents this pattern). `wirePair()` below
builds the view first with a placeholder controller (never observed — nothing calls a controller method on
a freshly-constructed, not-yet-rendered view), builds the real controller against that view, then patches
the view via `setController()`. `ResultsView` doesn't need this helper: it pairs with `LobbyController`,
which is already fully constructed by the time `ResultsView` is built.

**The screen router listens to the raw models directly, not through any view's `bindUpdateCallback`.**
Each `*View`'s `bindUpdateCallback` is a single-slot mechanism — whichever `*Screen` component is currently
mounted claims it for its own re-render. If `AppRouter` also tried to claim the same slot on the same view
instances to decide *which* screen to mount, the two would stomp on each other. Instead, `AppRouter`
registers its own plain `ModelListener` objects directly on `identityModel`/`queueModel`/`matchModel` — since
`AbstractModel.notifyChanged` already fires to every registered listener, not just one, both the router's
own re-render and the currently-mounted screen's re-render happen independently off the same event, with no
conflict.

**`socketFactory` is a testability seam, not a design deviation.** `docs/01_class_list.md` §6d's sketch of
`ClientMain.main()` takes no parameters. Per master context §4.2's testability principle (mirrored from the
server's `ConnectionHandler`), this method must be exercisable without opening a live Socket.IO connection —
`socketFactory` defaults to a real `io()` call so production code is unaffected, and a test supplies a mock
satisfying the same `emit`/`on` shape instead. Update `docs/01_class_list.md`'s `ClientMain` row to
`static main(socketFactory?: () => Socket): void` in the same commit as this implementation.

---

### 1. Replace `packages/client/src/ClientMain.tsx` with:

```tsx
import { useEffect, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import { MatchPhase } from '@arena/shared';
import { ClientIdentityModel } from './model/ClientIdentityModel';
import { ClientQueueModel } from './model/ClientQueueModel';
import { ClientMatchModel } from './model/ClientMatchModel';
import { SocketConnectionController } from './controller/SocketConnectionController';
import { LobbyController } from './controller/LobbyController';
import { ChampionSelectController } from './controller/ChampionSelectController';
import { MatchController } from './controller/MatchController';
import { LobbyView, LobbyScreen } from './view/LobbyView';
import { ChampionSelectView, ChampionSelectScreen } from './view/ChampionSelectView';
import { MatchHUDView, MatchHUDScreen } from './view/MatchHUDView';
import { ResultsView, ResultsScreen } from './view/ResultsView';

/**
 * Constructs one (controller, view) pair, breaking the circular constructor dependency between
 * them: the view is built first with a placeholder controller reference (never observed, since
 * nothing calls a method on it before the real controller replaces it via setController()), the
 * real controller is then built against that view, and the view is patched to point at it. This
 * is exactly what View.setController()/Controller.setView() exist for (docs/01_class_list.md §1).
 */
function wirePair<Model, ViewT extends { setController(c: unknown): void }, ControllerT>(
  makeView: (placeholderController: ControllerT) => ViewT,
  makeController: (view: ViewT) => ControllerT,
): { view: ViewT; controller: ControllerT } {
  const view = makeView(null as unknown as ControllerT);
  const controller = makeController(view);
  view.setController(controller);
  return { view, controller };
}

/**
 * Top-level screen router. Renders exactly one of the four SRS 3.1.1 screens based on current
 * model state, and re-renders whenever any of the three models changes — registered directly as
 * plain ModelListeners on the models themselves (not through any View's bindUpdateCallback, which
 * is a single-slot mechanism already claimed by whichever screen is currently mounted).
 */
function AppRouter(props: {
  identityModel: ClientIdentityModel;
  queueModel: ClientQueueModel;
  matchModel: ClientMatchModel;
  lobbyView: LobbyView;
  championSelectView: ChampionSelectView;
  matchHUDView: MatchHUDView;
  resultsView: ResultsView;
}): JSX.Element {
  const { identityModel, queueModel, matchModel, lobbyView, championSelectView, matchHUDView, resultsView } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const listener = { modelChanged: () => forceRender() };
    identityModel.addModelListener(listener);
    queueModel.addModelListener(listener);
    matchModel.addModelListener(listener);
  }, [identityModel, queueModel, matchModel]);

  if (identityModel.username === null || queueModel.status !== 'matched') {
    return <LobbyScreen view={lobbyView} />;
  }
  if (matchModel.result !== null) {
    return <ResultsScreen view={resultsView} />;
  }
  if (matchModel.phase === MatchPhase.ACTIVE) {
    return <MatchHUDScreen view={matchHUDView} />;
  }
  return <ChampionSelectScreen view={championSelectView} />;
}

/**
 * Application entry point for the Arena client. Constructs the full model/controller/view graph
 * and mounts the React root onto the DOM (SRS 2.1, R-D7).
 */
export class ClientMain {
  /**
   * Instantiates all models, controllers, and views; wires them together; and mounts the React
   * root with the screen router as the top-level component.
   *
   * CORRECTION (Step 10): docs/01_class_list.md §6d's sketch takes no parameters. A `socketFactory`
   * is added, defaulting to a real `io()` call, so this method never needs to open a live socket
   * connection to be exercised by a test (master context §4.2's testability principle) — a test
   * supplies a mock satisfying the same `emit`/`on` shape instead.
   * @param socketFactory - produces the Socket.IO client socket to use; defaults to a real connection
   * @throws {Error} if no `#root` element exists in the document to mount into
   */
  static main(socketFactory: () => Socket = () => io()): void {
    const identityModel = new ClientIdentityModel();
    const queueModel = new ClientQueueModel();
    const matchModel = new ClientMatchModel();

    const socket = socketFactory();
    const socketController = new SocketConnectionController(socket, {
      identity: identityModel,
      queue: queueModel,
      match: matchModel,
    });

    const { view: lobbyView, controller: lobbyController } = wirePair<
      ClientIdentityModel,
      LobbyView,
      LobbyController
    >(
      (placeholder) => new LobbyView(identityModel, queueModel, placeholder),
      (view) => new LobbyController(identityModel, view, socketController),
    );

    const { view: championSelectView } = wirePair<ClientMatchModel, ChampionSelectView, ChampionSelectController>(
      (placeholder) => new ChampionSelectView(identityModel, matchModel, queueModel, placeholder),
      (view) => new ChampionSelectController(matchModel, view, socketController),
    );

    const { view: matchHUDView } = wirePair<ClientMatchModel, MatchHUDView, MatchController>(
      (placeholder) => new MatchHUDView(identityModel, matchModel, placeholder),
      (view) => new MatchController(matchModel, view, socketController),
    );

    // ResultsView pairs with LobbyController (docs/01_class_list.md §6c gap-fill) — no separate
    // controller to wire, and no circular dependency to break (LobbyController already exists).
    const resultsView = new ResultsView(matchModel, queueModel, lobbyController);

    const container = document.getElementById('root');
    if (!container) {
      throw new Error('ClientMain.main: no #root element found to mount into');
    }
    const root = createRoot(container);
    root.render(
      <AppRouter
        identityModel={identityModel}
        queueModel={queueModel}
        matchModel={matchModel}
        lobbyView={lobbyView}
        championSelectView={championSelectView}
        matchHUDView={matchHUDView}
        resultsView={resultsView}
      />,
    );
  }
}
```

### 2. Create `packages/client/src/__tests__/ClientMain.test.tsx` with:

```tsx
import { act, fireEvent } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { ClientMain } from '../ClientMain';

function makeFakeSocket() {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const socket = {
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: jest.fn(),
    connect: jest.fn(),
  };
  return { socket: socket as unknown as Socket, handlers };
}

describe('ClientMain.main', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('mounts the full model/controller/view graph without throwing, given a mock socket', () => {
    const { socket } = makeFakeSocket();
    expect(() => {
      act(() => {
        ClientMain.main(() => socket);
      });
    }).not.toThrow();
  });

  it('renders the Lobby screen (identify form) before identification', () => {
    const { socket } = makeFakeSocket();
    act(() => {
      ClientMain.main(() => socket);
    });
    const root = document.getElementById('root');
    expect(root?.innerHTML).not.toBe('');
    expect(root?.querySelector('form[aria-label="identify-form"]')).not.toBeNull();
  });

  it('throws a clear error rather than a cryptic DOM failure when #root is missing', () => {
    document.body.innerHTML = '';
    const { socket } = makeFakeSocket();
    expect(() => {
      act(() => {
        ClientMain.main(() => socket);
      });
    }).toThrow(/#root/);
  });

  it('never opens a real socket connection itself — only calls the injected factory, exactly once', () => {
    const { socket } = makeFakeSocket();
    const factory = jest.fn(() => socket);
    act(() => {
      ClientMain.main(factory);
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL CHECKPOINT: identifying via the UI then receiving match:found routes from Lobby to Champion Select, through the real wiring end to end', () => {
    const { socket, handlers } = makeFakeSocket();
    act(() => {
      ClientMain.main(() => socket);
    });
    const root = document.getElementById('root')!;

    // Drive identification the way a real user would: through the rendered form, LobbyController,
    // and SocketConnectionController — not by reaching into private model instances (main() exposes
    // none), since ClientMain's whole job is wiring these together, not just constructing them.
    act(() => {
      fireEvent.change(root.querySelector('#username')!, { target: { value: 'Raj' } });
      fireEvent.click(root.querySelector('button[type="submit"]')!);
    });
    expect(root.querySelector('form[aria-label="identify-form"]')).toBeNull();

    act(() => {
      handlers.get('match:found')!({ matchId: 'm1', team: 'A', opponentUsername: 'Bob', roster: [] });
    });

    expect(root.querySelector('ul[aria-label="champion-roster"]')).not.toBeNull();
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes; `npx jest ClientMain --coverage
--collectCoverageFrom="src/ClientMain.tsx"` — validated result: **5 tests passing, 94.73% statement / 57.14%
branch / 92.3% function / 94.54% line coverage** (uncovered: the `MatchHUDScreen`/`ResultsScreen` router
branches and the default `socketFactory`'s `io()` call — deliberately not exercised, since driving the
router all the way to those screens or invoking a real `io()` in a test would be exactly the
over-engineering this prompt is told to avoid). Then run the full client suite (`npx jest -w @arena/client`)
— validated result: **34 tests passing across 5 suites**. Branch `client` from `main` (or reuse an
already-checked-out `client` branch), commit `Step 10: ClientMain implementation and tests — client
controller and view package complete`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this is the wiring prompt — resist the urge to add logic here that belongs in a model,
controller, or view.** `ClientMain`'s only jobs are constructing the object graph, breaking the
View↔Controller circular dependency via `wirePair`, and rendering the screen router. If you find yourself
wanting to add validation, business logic, or additional screens here, that belongs in one of the eight
prior `10_client_*` components instead — per master context §1.1, the client renders what the server sends
and never computes an outcome, and this file's only "decision" is which already-built screen to mount.
