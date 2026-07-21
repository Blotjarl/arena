import { Player, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';

export class PlayerRepository {
  constructor(private readonly pool: PgPool) {}

  /** Auto-creates a Player row the first time a username is seen (R-DB1, 3.2.1). @throws PersistenceError */
  async findOrCreateByUsername(username: string): Promise<Player> {
    throw new NotImplementedError('PlayerRepository.findOrCreateByUsername not yet implemented');
  }
}
