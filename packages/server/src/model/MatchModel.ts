import {
  AbstractModel,
  MatchId,
  MatchPhase,
  EndReason,
  Team,
  Player,
  MatchStatePayload,
  NotImplementedError,
} from '@arena/shared';
import { ParticipantState } from './ParticipantState';

/**
 * One instance of gameplay, champion selection through a win condition — the authoritative source of
 * truth for both participants (2.1, R4.1). Owns exactly two ParticipantState (1v1 scope) and notifies its
 * MatchBroadcastView listener on every state-relevant change via AbstractModel.
 */
export class MatchModel extends AbstractModel {
  /** Current stage of the match; most operations below are only valid in one specific phase. */
  public phase: MatchPhase = MatchPhase.CHAMPION_SELECT;
  private participants: [ParticipantState, ParticipantState];
  /** Simulation timestamp (ms) by which both players must select a champion, or the match ends (R3.4). */
  public championSelectDeadline = 0;
  /** Simulation timestamp (ms) the ACTIVE phase began, or null before combat starts. */
  public startedAt: number | null = null;
  /** Simulation timestamp (ms) the match ended, or null while still in progress. */
  public endedAt: number | null = null;
  /** Why the match ended, or null while still in progress (R5.3). */
  public endReason: EndReason | null = null;
  /** The winning team, or null for a draw or a match still in progress. */
  public winningTeam: Team | null = null;

  constructor(
    /** Stable identifier for this match. */
    public readonly id: MatchId,
    players: [Player, Player],
  ) {
    super();
    this.participants = [
      new ParticipantState(players[0].id, Team.A),
      new ParticipantState(players[1].id, Team.B),
    ];
  }

  /**
   * Records a player's champion choice during Champion Select.
   * @param playerId - the selecting player
   * @param championId - the chosen champion's identifier
   * @throws {InvalidChampionSelectionError} if championId does not match any champion in the roster (R3.2)
   * @throws {SelectionWindowExpiredError} if the 30-second selection window has elapsed (R3.4)
   * @throws {InvalidMatchPhaseError} if the match is not currently in CHAMPION_SELECT
   */
  selectChampion(playerId: string, championId: string): void {
    throw new NotImplementedError('MatchModel.selectChampion not yet implemented');
  }

  /**
   * Forwards movement input to the submitting player's ParticipantState for the current tick.
   * @param playerId - the moving player
   * @param input - raw directional input for this tick
   * @throws {InvalidMatchPhaseError} if the match is not currently ACTIVE
   */
  submitMove(playerId: string, input: { dx: number; dy: number }): void {
    throw new NotImplementedError('MatchModel.submitMove not yet implemented');
  }

  /**
   * Resolves and forwards an ability-use request. Because ParticipantState.useAbility() has no
   * target-position parameter, this method is where target range is checked (R4.2) — it has access to
   * both participants and computes the distance from req.targetPlayerId/targetPosition against
   * ability.range before delegating cooldown/resource/incapacitation checks to ParticipantState.
   * @param playerId - the acting player
   * @param req - the ability id and optional target
   * @throws {InvalidMatchPhaseError} if the match is not currently ACTIVE
   *
   * All per-ability validation failures — unknown ability, cooldown, insufficient resource, incapacitation,
   * and out-of-range target — are caught internally and silently ignored (the action has no effect) rather
   * than propagated to the caller, per R4's "silently ignores" behavior; see CombatController.
   */
  submitAbility(playerId: string, req: { abilityId: string; targetPlayerId?: string }): void {
    throw new NotImplementedError('MatchModel.submitAbility not yet implemented');
  }

  /**
   * Advances the match simulation by one tick: regenerates resource, expires cooldowns/crowd control,
   * checks win conditions, and notifies listeners with the new state (R4.3–R4.6).
   * CRITICAL: called by TickLoop.onTick() up to 20x/sec, once per registered match. This method itself
   * must never throw uncaught — TickLoop wraps each call in a per-match try/catch specifically so one
   * match's internal error cannot crash the loop or affect any other in-progress match (R5.4, 3.6.2). This
   * isolation guarantee lives in TickLoop, not here; tick() should still avoid throwing where avoidable.
   * @param deltaSeconds - elapsed simulation time since the previous tick
   */
  tick(deltaSeconds: number): void {
    throw new NotImplementedError('MatchModel.tick not yet implemented');
  }

  /**
   * Evaluates whether the match has reached a win condition this tick (elimination or time limit).
   * @returns the reason the match ended, or null if it should continue
   */
  checkWinConditions(): EndReason | null {
    throw new NotImplementedError('MatchModel.checkWinConditions not yet implemented');
  }

  /**
   * Marks a participant disconnected and starts their 30-second reconnect grace period (R6.1, R6.2, R6.4).
   * Does not itself throw — an already-disconnected participant is simply left as is.
   * @param playerId - the player whose socket disconnected
   */
  disconnect(playerId: string): void {
    throw new NotImplementedError('MatchModel.disconnect not yet implemented');
  }

  /**
   * Restores a disconnected participant to CONNECTED if they reconnect within the grace period.
   * @param playerId - the reconnecting player
   * @throws {GracePeriodExpiredError} if the 30-second grace period has already elapsed (R6.3, R6.4)
   */
  reconnect(playerId: string): void {
    throw new NotImplementedError('MatchModel.reconnect not yet implemented');
  }

  /** @returns a read-only snapshot of both participants and match metadata, for broadcast to clients. */
  snapshot(): MatchStatePayload {
    throw new NotImplementedError('MatchModel.snapshot not yet implemented');
  }
}
