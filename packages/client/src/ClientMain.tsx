import { useEffect, useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import { MatchPhase, SOCKET_EVENTS, IdentifyPayload } from '@arena/shared';
import { ClientIdentityModel } from './model/ClientIdentityModel';
import { ClientQueueModel } from './model/ClientQueueModel';
import { ClientMatchModel } from './model/ClientMatchModel';
import { ClientLeaderboardModel } from './model/ClientLeaderboardModel';
import { SocketConnectionController } from './controller/SocketConnectionController';
import { LobbyController } from './controller/LobbyController';
import { ChampionSelectController } from './controller/ChampionSelectController';
import { MatchController } from './controller/MatchController';
import { LeaderboardController } from './controller/LeaderboardController';
import { LobbyView, LobbyScreen } from './view/LobbyView';
import { ChampionSelectView, ChampionSelectScreen } from './view/ChampionSelectView';
import { MatchHUDView, MatchHUDScreen } from './view/MatchHUDView';
import { ResultsView, ResultsScreen } from './view/ResultsView';
import { LeaderboardView, LeaderboardScreen } from './view/LeaderboardView';

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
 *
 * CORRECTION (11_client_7): the Leaderboard screen is not one of SRS 3.1.1's four formally-listed
 * screens (see `LeaderboardView.tsx`'s own doc comment for the SRS ambiguity this resolves) and isn't
 * tied to any server-reported phase the way the other four are — it's a player-initiated "look something
 * up" overlay. Modeled as a plain `showLeaderboard` boolean owned by this router, checked *before* the
 * phase-based routing below, so it takes over the whole screen regardless of current match/queue state.
 * Reachable only from the Lobby (idle) and Results screens, via the `onViewLeaderboard` prop passed into
 * both — deliberately no entry point during queueing, Champion Select, or an active match.
 */
function AppRouter(props: {
  identityModel: ClientIdentityModel;
  queueModel: ClientQueueModel;
  matchModel: ClientMatchModel;
  lobbyView: LobbyView;
  championSelectView: ChampionSelectView;
  matchHUDView: MatchHUDView;
  resultsView: ResultsView;
  leaderboardView: LeaderboardView;
}): JSX.Element {
  const {
    identityModel,
    queueModel,
    matchModel,
    lobbyView,
    championSelectView,
    matchHUDView,
    resultsView,
    leaderboardView,
  } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    const listener = { modelChanged: () => forceRender() };
    identityModel.addModelListener(listener);
    queueModel.addModelListener(listener);
    matchModel.addModelListener(listener);
  }, [identityModel, queueModel, matchModel]);

  if (showLeaderboard) {
    return <LeaderboardScreen view={leaderboardView} onBack={() => setShowLeaderboard(false)} />;
  }
  if (identityModel.username === null || queueModel.status !== 'matched') {
    return <LobbyScreen view={lobbyView} onViewLeaderboard={() => setShowLeaderboard(true)} />;
  }
  if (matchModel.result !== null) {
    return <ResultsScreen view={resultsView} onViewLeaderboard={() => setShowLeaderboard(true)} />;
  }
  if (matchModel.phase === MatchPhase.ACTIVE) {
    return <MatchHUDScreen view={matchHUDView} />;
  }
  return <ChampionSelectScreen view={championSelectView} />;
}

/**
 * Server URL the default socketFactory connects to. A bare `io()` call with no URL argument connects
 * to whatever origin served the page, which only works when client and server share an origin — not
 * true across separate dev-server ports or separate production hosts. `__SERVER_URL__` is a global
 * injected by `vite.config.ts` from the `VITE_SERVER_URL` env var (see that file for why it's a
 * `define`d global rather than the more idiomatic `import.meta.env.VITE_SERVER_URL` — short version:
 * `import.meta` syntax needs an ESM `module` target, which this file's CommonJS-targeted tsconfig
 * can't use without breaking ts-jest). It's simply undeclared outside a Vite build (e.g. under Jest),
 * where the `typeof` guard below falls back to a local-dev default instead.
 */
const DEFAULT_SERVER_URL = typeof __SERVER_URL__ !== 'undefined' ? __SERVER_URL__ : 'http://localhost:3001';

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
   *
   * CORRECTION (Step 11): the default `socketFactory` now calls `io(DEFAULT_SERVER_URL)` instead of
   * a bare `io()`, so it connects to the configured game server rather than assuming same-origin.
   * @param socketFactory - produces the Socket.IO client socket to use; defaults to a real connection
   *   to `VITE_SERVER_URL` (or `http://localhost:3001` if unset)
   * @throws {Error} if no `#root` element exists in the document to mount into
   */
  static main(socketFactory: () => Socket = () => io(DEFAULT_SERVER_URL)): void {
    const identityModel = new ClientIdentityModel();
    const queueModel = new ClientQueueModel();
    const matchModel = new ClientMatchModel();

    const socket = socketFactory();
    const socketController = new SocketConnectionController(socket, {
      identity: identityModel,
      queue: queueModel,
      match: matchModel,
    });

    // R6.1-R6.4: Socket.IO's client fires its own 'connect' event both on the first successful
    // connection and on every subsequent transport-level reconnect. A fresh server-side connection
    // starts unidentified, so a reconnect must re-identify before anything else — including before
    // match:reconnect, which requires an already-identified connection server-side. Guarded on
    // identityModel.username/playerId so the very first, pre-login connect emits nothing.
    socket.on('connect', () => {
      if (identityModel.username === null || identityModel.playerId === null) {
        return;
      }
      const identifyPayload: IdentifyPayload = {
        playerId: identityModel.playerId,
        username: identityModel.username,
      };
      socketController.operation(SOCKET_EVENTS.IDENTIFY, identifyPayload);
      if (matchModel.matchId !== null && matchModel.phase !== MatchPhase.ENDED) {
        socketController.operation(SOCKET_EVENTS.MATCH_RECONNECT);
      }
    });

    const { view: lobbyView, controller: lobbyController } = wirePair<
      ClientIdentityModel,
      LobbyView,
      LobbyController
    >(
      (placeholder) => new LobbyView(identityModel, queueModel, placeholder, socket),
      (view) => new LobbyController(identityModel, view, socketController),
    );

    const { view: championSelectView } = wirePair<ClientMatchModel, ChampionSelectView, ChampionSelectController>(
      (placeholder) => new ChampionSelectView(identityModel, matchModel, queueModel, placeholder),
      (view) => new ChampionSelectController(matchModel, view, socketController),
    );

    const { view: matchHUDView } = wirePair<ClientMatchModel, MatchHUDView, MatchController>(
      (placeholder) => new MatchHUDView(identityModel, matchModel, placeholder, socket),
      (view) => new MatchController(matchModel, view, socketController),
    );

    // ResultsView pairs with LobbyController (docs/01_class_list.md §6c gap-fill) — no separate
    // controller to wire, and no circular dependency to break (LobbyController already exists).
    const resultsView = new ResultsView(matchModel, queueModel, lobbyController);

    // CORRECTION (11_client_7): LeaderboardController talks directly to the api over REST, not through
    // socketController/Socket.IO — no dependency on the socket wiring above, unlike every other pair.
    const leaderboardModel = new ClientLeaderboardModel();
    const { view: leaderboardView } = wirePair<ClientLeaderboardModel, LeaderboardView, LeaderboardController>(
      (placeholder) => new LeaderboardView(leaderboardModel, placeholder),
      (view) => new LeaderboardController(leaderboardModel, view),
    );

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
        leaderboardView={leaderboardView}
      />,
    );
  }
}
