import { ArenaError } from './ArenaError';

export class InvalidChampionSelectionError extends ArenaError {
  readonly code = 'INVALID_CHAMPION_SELECTION';
  constructor(championId: string) {
    super(`"${championId}" is not a champion in the roster.`);
  }
}
