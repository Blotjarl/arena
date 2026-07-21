import { AbstractModel, PlayerId, NotImplementedError } from '@arena/shared';

export class ClientIdentityModel extends AbstractModel {
  public playerId: PlayerId | null = null;
  public username: string | null = null;

  /** Persists to sessionStorage per R1.2 (same identifier survives a page reload within the session). */
  identify(username: string): void {
    throw new NotImplementedError('ClientIdentityModel.identify not yet implemented');
  }

  /** @throws PlayerNotFoundError-equivalent client-side check if called before identify(). */
  getPlayerId(): PlayerId {
    throw new NotImplementedError('ClientIdentityModel.getPlayerId not yet implemented');
  }
}
