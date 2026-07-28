import {
  AbstractController,
  ModelEvent,
  Player,
  PlayerId,
  Team,
  ChampionRoster,
  SOCKET_EVENTS,
  MatchFoundPayload,
} from '@arena/shared';
import type { Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { MatchmakingQueue } from '../model/MatchmakingQueue';
import { MatchModel } from '../model/MatchModel';
import { TickLoop } from '../model/TickLoop';
import { MatchmakingBroadcastView } from '../view/MatchmakingBroadcastView';
import { MatchBroadcastView } from '../view/MatchBroadcastView';
import { MatchReportingClient } from './MatchReportingClient';
import { MatchReportingListener } from './MatchReportingListener';

/** Payload ConnectionHandler forwards for `queue:join`/`queue:cancel` — the connection's identified player. */
export interface MatchmakingRequest {
  player: Player;
}

/**
 * `MatchFoundPayload` plus the routing `playerId` — this controller broadcasts one of these per paired
 * player (see `createMatch`); `MatchmakingBroadcastView` (10_server_7) strips `playerId` back out before
 * emitting, so the wire payload still matches `MatchFoundPayload` exactly. Defined here (not on the view)
 * since this controller is the only thing that constructs one.
 */
export type MatchFoundBroadcast = MatchFoundPayload & { playerId: PlayerId };

/** Invoked once per newly-paired match, so the caller (ConnectionHandler/ServerMain) can bind the two players' championSelect/combat/disconnect controllers to it — see 10_server_6. */
export type OnMatchCreated = (playerIds: [PlayerId, PlayerId], match: MatchModel, view: MatchBroadcastView) => void;

/**
 * One playerId's still-active match, as tracked by the process-wide match registry (10_server_10) — lets a
 * reconnecting player's brand-new `ConnectionHandler` (a fresh Socket.IO connection gets a fresh handler,
 * see `ServerMain`) be rebound to the match it's already in, since `bindMatch()` otherwise only ever fires
 * once, at original pairing time.
 */
export interface MatchRegistryEntry {
  match: MatchModel;
  view: MatchBroadcastView;
}

/**
 * Handles queue join/cancel requests against the shared MatchmakingQueue and, on a successful pairing,
 * stands up a new match (R2.1–R2.6).
 */
export class MatchmakingController extends AbstractController {
  constructor(
    model: MatchmakingQueue,
    view: MatchmakingBroadcastView,
    private readonly tickLoop: TickLoop,
    /** Every currently-connected player's socket, keyed by playerId — shared with the broadcast views, so a freshly-built MatchBroadcastView can target this match's two participants. */
    private readonly sockets: Map<PlayerId, Socket>,
    /** CORRECTION (Step 10): cross-connection wiring callback — see OnMatchCreated doc above. Not part of docs/01_class_list.md's original constructor sketch, added because ChampionSelectController/CombatController/DisconnectController require a MatchModel that doesn't exist until pairing happens on (from either player's perspective) only one of the two connections. */
    private readonly onMatchCreated: OnMatchCreated,
    /** CORRECTION (Step 10, 10_server_9): every newly-created match's begin/end report goes through this
     * one shared client — see MatchReportingListener, constructed per-match in createMatch() below. */
    private readonly reportingClient: MatchReportingClient,
    /** CORRECTION (Step 10, 10_server_10): process-wide playerId -> still-active-match registry, shared
     * with ServerMain — populated here on pairing and cleared on 'match:end', so ServerMain can rebind a
     * reconnecting player's fresh ConnectionHandler to their match (R6.1-R6.4). */
    private readonly matchRegistry: Map<PlayerId, MatchRegistryEntry>,
  ) {
    super(model, view);
  }

  /**
   * Dispatches a `queue:join` or `queue:cancel` request. On a successful pairing (queue:join only), this
   * constructs a new MatchModel and MatchBroadcastView for the paired players and registers the match with
   * TickLoop (R2.6) — the pairing itself is MatchmakingQueue's responsibility, not this method's.
   * @param action - 'queue:join' or 'queue:cancel'
   * @param payload - for 'queue:join', the requesting player's identity; empty for 'queue:cancel'
   * @throws {AlreadyQueuedError} if 'queue:join' is called while already queued or in an active match (R2.2)
   * @throws {NotQueuedError} if 'queue:cancel' is called while not currently queued (R2.3)
   */
  operation(action: string, payload?: MatchmakingRequest): void {
    const queue = this.model as MatchmakingQueue;

    if (action === SOCKET_EVENTS.QUEUE_CANCEL) {
      queue.cancel(payload!.player.id);
      return;
    }

    // 'queue:join' — MatchmakingQueue.join() itself broadcasts 'queue:joined' via the Observer mechanism.
    queue.join(payload!.player);
    const pair = queue.tryPairNext();
    if (!pair) return;
    this.createMatch(pair[0].playerId, pair[0].username, pair[1].playerId, pair[1].username);
  }

  private createMatch(playerIdA: PlayerId, usernameA: string, playerIdB: PlayerId, usernameB: string): void {
    const queue = this.model as MatchmakingQueue;
    const view = this.view as MatchmakingBroadcastView;
    const matchId = randomUUID();
    const playerA = new Player(playerIdA, usernameA, new Date());
    const playerB = new Player(playerIdB, usernameB, new Date());
    const match = new MatchModel(matchId, [playerA, playerB]);
    const matchBroadcastView = new MatchBroadcastView(match, this.sockets);
    // CORRECTION (Step 10, 10_server_9): closes the R7.1-R7.4 persistence gap — reports this match's
    // begin/end to packages/api. A second, independent listener alongside matchBroadcastView (both react
    // to the same MatchModel events; neither knows about the other).
    new MatchReportingListener(match, [playerA, playerB], this.reportingClient);

    // CORRECTION (Step 10, 10_server_10): registers both players into the process-wide match registry so a
    // reconnecting player's fresh ConnectionHandler can be rebound to this match later — see the cleanup
    // listener below, which removes these same two entries once the match ends.
    this.matchRegistry.set(playerIdA, { match, view: matchBroadcastView });
    this.matchRegistry.set(playerIdB, { match, view: matchBroadcastView });

    this.tickLoop.register(match);
    // CORRECTION (Step 10): MatchBroadcastView has no TickLoop reference (docs/01_class_list.md §5c
    // constructor is (model, sockets) only), so nothing else unregisters a finished match. This listener
    // is the match's cleanup — added here, alongside registration, since this is the one place both halves
    // of the match's TickLoop lifecycle are naturally symmetric. CORRECTION (Step 10, 10_server_10): also
    // releases the queue's R2.2/R2.5 tracking and clears the match registry — both must happen exactly
    // once per match, and both need the same event, so this one listener does all three cleanup jobs
    // rather than three separate 'match:end' listeners racing each other.
    match.addModelListener({
      modelChanged: (event) => {
        if (event.type !== 'match:end') return;
        this.tickLoop.unregister(match.id);
        queue.releaseMatch([playerIdA, playerIdB]);
        this.matchRegistry.delete(playerIdA);
        this.matchRegistry.delete(playerIdB);
      },
    });

    const roster = ChampionRoster.getAll();
    const foundA: MatchFoundBroadcast = {
      playerId: playerIdA,
      matchId,
      team: Team.A,
      opponentUsername: usernameB,
      roster,
    };
    const foundB: MatchFoundBroadcast = {
      playerId: playerIdB,
      matchId,
      team: Team.B,
      opponentUsername: usernameA,
      roster,
    };
    view.modelChanged(new ModelEvent(this.model as MatchmakingQueue, 'match:found', foundA));
    view.modelChanged(new ModelEvent(this.model as MatchmakingQueue, 'match:found', foundB));

    this.onMatchCreated([playerIdA, playerIdB], match, matchBroadcastView);
  }
}
