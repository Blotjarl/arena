import { randomUUID } from 'crypto';
import { Player } from '@arena/shared';
import { PgPool } from '../util/PgPool';

interface PlayerRow {
  id: string;
  username: string;
  created_at: string;
}

function toPlayer(row: PlayerRow): Player {
  return new Player(row.id, row.username, new Date(row.created_at));
}

/** Persists and looks up `Player` rows. The only repository player identity flows through (R1.1, 3.2.1). */
export class PlayerRepository {
  /** @param pool - the shared connection pool this repository queries through */
  constructor(private readonly pool: PgPool) {}

  /**
   * Finds the Player row for a username, creating one if this is the first time it's been seen (R-DB1,
   * SRS 3.2.1 — there is no separate registration step). Resolves by **username**, not by whatever
   * transient client-generated PlayerId a live match used — SRS 3.4 keys `Player` rows by unique username,
   * while the live match's id is only stable within one browser session (R1.2). Returns the canonical
   * stored id.
   * @param username - the client-supplied username
   * @returns the existing or newly-created Player
   * @throws {PersistenceError} if the underlying query fails
   */
  async findOrCreateByUsername(username: string): Promise<Player> {
    const existing = await this.pool.query<PlayerRow>('SELECT id, username, created_at FROM players WHERE username = $1', [
      username,
    ]);
    if (existing.length > 0) {
      return toPlayer(existing[0]);
    }
    const id = randomUUID();
    const created = await this.pool.query<PlayerRow>(
      'INSERT INTO players (id, username) VALUES ($1, $2) RETURNING id, username, created_at',
      [id, username],
    );
    return toPlayer(created[0]);
  }
}
