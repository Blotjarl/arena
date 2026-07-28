import {
  ModelListener,
  ModelEvent,
  Player,
  MatchStartPayload,
  MatchEndPayload,
  MatchBeginReportDTO,
} from '@arena/shared';
import { MatchModel } from '../model/MatchModel';
import { MatchReportingClient } from './MatchReportingClient';

/**
 * Reports one MatchModel's begin/end to `packages/api` via `MatchReportingClient`, closing R7.1–R7.4's
 * persistence gap (see `prompts/10_server_9_match-reporting-wiring.md`). A `ModelListener`, not a `View` —
 * it has no paired controller and broadcasts nothing to a socket; it exists alongside `MatchBroadcastView`
 * as a second, independent observer of the same `MatchModel` (the push-notification pattern supports
 * multiple listeners on one Model).
 *
 * `MatchModel` never retains `Player.username` — only `ParticipantState.playerId` — so this class is
 * constructed with the full `Player` objects from `MatchmakingController.createMatch()`, the one place both
 * the transient player identities and the newly-created match are in scope together.
 */
export class MatchReportingListener implements ModelListener {
  constructor(
    match: MatchModel,
    private readonly players: [Player, Player],
    private readonly reportingClient: MatchReportingClient,
  ) {
    match.addModelListener(this);
  }

  /**
   * Reacts to `MatchModel`'s `'match:start'`/`'match:end'` events by forwarding a report to the api. Both
   * calls are fire-and-forget — `MatchReportingClient`'s own methods already log-and-swallow any failure
   * (R7.4), so nothing here needs to await or catch. `'match:start'` fires exactly once, only once both
   * players have selected a champion (R7.2's guarantee — a match that times out during Champion Select
   * never reaches it), and `'match:end'` fires exactly once per match, so each report method is called at
   * most once per match, satisfying `PendingMatchCorrelator`'s idempotency precondition on the api side.
   * @param event - the model-pushed change to (maybe) report
   */
  modelChanged(event: ModelEvent): void {
    if (event.type === 'match:start') {
      const { matchId, initialState } = event.payload as MatchStartPayload;
      const participants: MatchBeginReportDTO['participants'] = this.players.map((player) => {
        const snapshot = initialState.participants.find((p) => p.playerId === player.id);
        if (!snapshot) {
          throw new Error(`MatchReportingListener: no participant snapshot found for playerId ${player.id}`);
        }
        return {
          playerId: player.id,
          username: player.username,
          team: snapshot.team,
          championId: snapshot.championId,
        };
      });
      void this.reportingClient.reportMatchBegin(matchId, participants);
      return;
    }

    if (event.type === 'match:end') {
      const { matchId, reason, winningTeam, durationMs } = event.payload as MatchEndPayload;
      void this.reportingClient.reportMatchEnd(matchId, {
        endReason: reason,
        winningTeam,
        durationMs,
        endedAt: new Date().toISOString(),
      });
    }
  }
}
