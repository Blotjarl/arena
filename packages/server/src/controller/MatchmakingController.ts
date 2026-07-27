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
    const view = this.view as MatchmakingBroadcastView;
    const matchId = randomUUID();
    const playerA = new Player(playerIdA, usernameA, new Date());
    const playerB = new Player(playerIdB, usernameB, new Date());
    const match = new MatchModel(matchId, [playerA, playerB]);
    const matchBroadcastView = new MatchBroadcastView(match, this.sockets);

    this.tickLoop.register(match);
    // CORRECTION (Step 10): MatchBroadcastView has no TickLoop reference (docs/01_class_list.md §5c
    // constructor is (model, sockets) only), so nothing else unregisters a finished match. This listener
    // is the match's cleanup — added here, alongside registration, since this is the one place both halves
    // of the match's TickLoop lifecycle are naturally symmetric.
    match.addModelListener({
      modelChanged: (event) => {
        if (event.type === 'match:end') this.tickLoop.unregister(match.id);
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
