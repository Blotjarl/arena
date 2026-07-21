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

export class MatchModel extends AbstractModel {
  public phase: MatchPhase = MatchPhase.CHAMPION_SELECT;
  private participants: [ParticipantState, ParticipantState];
  public championSelectDeadline = 0;
  public startedAt: number | null = null;
  public endedAt: number | null = null;
  public endReason: EndReason | null = null;
  public winningTeam: Team | null = null;

  constructor(
    public readonly id: MatchId,
    players: [Player, Player],
  ) {
    super();
    this.participants = [
      new ParticipantState(players[0].id, Team.A),
      new ParticipantState(players[1].id, Team.B),
    ];
  }

  /** @throws InvalidChampionSelectionError | SelectionWindowExpiredError | InvalidMatchPhaseError */
  selectChampion(playerId: string, championId: string): void {
    throw new NotImplementedError('MatchModel.selectChampion not yet implemented');
  }

  /** @throws InvalidMatchPhaseError */
  submitMove(playerId: string, input: { dx: number; dy: number }): void {
    throw new NotImplementedError('MatchModel.submitMove not yet implemented');
  }

  /** @throws InvalidMatchPhaseError — an invalid ability request is otherwise silently ignored per R4. */
  submitAbility(playerId: string, req: { abilityId: string; targetPlayerId?: string }): void {
    throw new NotImplementedError('MatchModel.submitAbility not yet implemented');
  }

  /** CRITICAL: called by TickLoop 20x/sec — must never throw uncaught (see prompts/00_master_context.md §8). */
  tick(deltaSeconds: number): void {
    throw new NotImplementedError('MatchModel.tick not yet implemented');
  }

  checkWinConditions(): EndReason | null {
    throw new NotImplementedError('MatchModel.checkWinConditions not yet implemented');
  }

  disconnect(playerId: string): void {
    throw new NotImplementedError('MatchModel.disconnect not yet implemented');
  }

  /** @throws GracePeriodExpiredError */
  reconnect(playerId: string): void {
    throw new NotImplementedError('MatchModel.reconnect not yet implemented');
  }

  snapshot(): MatchStatePayload {
    throw new NotImplementedError('MatchModel.snapshot not yet implemented');
  }
}
