import {
  AbstractModel, ModelEvent, MatchId, MatchPhase,
  ChampionSelectedPayload, MatchStartPayload, MatchStatePayload, MatchEndPayload,
} from '@arena/shared';

/**
 * Mirror of authoritative match state as broadcast by the server (R4.1–R4.7).
 * Every field is populated exclusively by apply*() calls driven by server events — the client
 * never computes or overrides values here; it only stores what the server has sent.
 */
export class ClientMatchModel extends AbstractModel {
  /** Server-assigned match identifier; null until the match:start event is received. */
  public matchId: MatchId | null = null;

  /** Current phase of the match lifecycle; null until champion selection begins. */
  public phase: MatchPhase | null = null;

  /** Most recent authoritative state snapshot; null until the first match:state tick arrives. */
  public latestState: MatchStatePayload | null = null;

  /** Final match result payload; null until match:end is received. */
  public result: MatchEndPayload | null = null;

  /** Most recent champion selection payload; null until champion:selected is received. */
  public championSelection: ChampionSelectedPayload | null = null;

  /**
   * Records a champion selection event from the server (R3.3).
   * @param payload - the champion:selected event payload
   */
  applyChampionSelected(payload: ChampionSelectedPayload): void {
    this.championSelection = payload;
    // CORRECTION (Step 10, 10_client_6): none of this class's apply*() methods previously called
    // notifyChanged — see the identical correction and rationale on ClientIdentityModel.identify()
    // (10_client_5). ChampionSelectView is the first consumer that registers as a listener here.
    this.notifyChanged(new ModelEvent(this, 'championSelection:changed', payload));
  }

  /**
   * Transitions the match into the COMBAT phase using the server's start payload (R4.1).
   * @param payload - the match:start event payload
   */
  applyMatchStart(payload: MatchStartPayload): void {
    this.matchId = payload.matchId;
    this.phase = MatchPhase.ACTIVE;
    this.latestState = payload.initialState;
    this.notifyChanged(new ModelEvent(this, 'matchStart', payload));
  }

  /**
   * Replaces latestState with the incoming authoritative snapshot (R4.7).
   * Must store the payload without modification — no field merging or client-side adjustment.
   * @param payload - the match:state broadcast from the server's tick loop
   */
  applyMatchState(payload: MatchStatePayload): void {
    this.latestState = payload;
    this.notifyChanged(new ModelEvent(this, 'matchState', payload));
  }

  /**
   * Records the final result of the match as determined by the server (R5.1–R5.3).
   * @param payload - the match:end event payload
   */
  applyMatchEnd(payload: MatchEndPayload): void {
    this.result = payload;
    this.notifyChanged(new ModelEvent(this, 'matchEnd', payload));
  }

  /**
   * REGRESSION FIX: clears every match-specific field back to its initial null value. This same
   * model instance is reused across a connection's whole session, not recreated per match — without
   * this, a returning player's second match:found left the first match's `result` and
   * `championSelection` in place, which permanently stuck AppRouter on ResultsScreen (it checks
   * `matchModel.result !== null` before anything else) and pre-disabled every "Select {champion}"
   * button on the new Champion Select screen (`disabled={mySelection !== null}`). Called by
   * SocketConnectionController's match:found handler, before ClientQueueModel.setMatched() for the
   * new match.
   */
  reset(): void {
    this.matchId = null;
    this.phase = null;
    this.latestState = null;
    this.result = null;
    this.championSelection = null;
    this.notifyChanged(new ModelEvent(this, 'matchReset', null));
  }
}
