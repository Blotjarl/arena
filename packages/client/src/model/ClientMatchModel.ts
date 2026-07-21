import {
  AbstractModel, MatchId, MatchPhase, NotImplementedError,
  ChampionSelectedPayload, MatchStartPayload, MatchStatePayload, MatchEndPayload,
} from '@arena/shared';

export class ClientMatchModel extends AbstractModel {
  public matchId: MatchId | null = null;
  public phase: MatchPhase | null = null;
  public latestState: MatchStatePayload | null = null;
  public result: MatchEndPayload | null = null;

  applyChampionSelected(payload: ChampionSelectedPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyChampionSelected not yet implemented');
  }

  applyMatchStart(payload: MatchStartPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchStart not yet implemented');
  }

  /** R4.7: stores the snapshot as-is; must not merge/alter values before storing. */
  applyMatchState(payload: MatchStatePayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchState not yet implemented');
  }

  applyMatchEnd(payload: MatchEndPayload): void {
    throw new NotImplementedError('ClientMatchModel.applyMatchEnd not yet implemented');
  }
}
