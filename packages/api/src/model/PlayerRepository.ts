import { Player, NotImplementedError } from '@arena/shared';
import { PgPool } from '../util/PgPool';

/** Persists and looks up `Player` rows. The only repository player identity flows through (R1.1, 3.2.1). */
export class PlayerRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Finds the Player row for a username, creating one if this is the first time it's been seen (R-DB1,
   * SRS 3.2.1 — there is no separate registration step).
   * @param username - the client-supplied username
   * @returns the existing or newly-created Player
   * @throws {PersistenceError} if the underlying query fails
   */
  async findOrCreateByUsername(username: string): Promise<Player> {
    throw new NotImplementedError('PlayerRepository.findOrCreateByUsername not yet implemented');
  }
}
