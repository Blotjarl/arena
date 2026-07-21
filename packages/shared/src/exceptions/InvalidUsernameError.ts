import { ArenaError } from './ArenaError';

export class InvalidUsernameError extends ArenaError {
  readonly code = 'INVALID_USERNAME';
  constructor(username: string) {
    super(`Invalid username: "${username}". Usernames must be 1-24 characters.`);
  }
}
