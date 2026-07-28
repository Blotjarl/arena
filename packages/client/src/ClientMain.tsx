import { useEffect, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { io, Socket } from 'socket.io-client';
import { MatchPhase, SOCKET_EVENTS, IdentifyPayload } from '@arena/shared';
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
