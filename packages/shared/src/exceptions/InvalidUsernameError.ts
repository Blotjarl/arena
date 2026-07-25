import { ArenaError } from './ArenaError';

/** Thrown when a player attempts to identify with an empty or over-length username (R1.1). */
export class InvalidUsernameError extends ArenaError {
  readonly code = 'INVALID_USERNAME';

  /** @param username - the rejected username */
  constructor(username: string) {
    super(`Invalid username: "${username}". Usernames must be 1-24 characters.`);
  }
}
