import { ArenaError } from './ArenaError';

/**
 * Thrown when a champion id doesn't resolve to a roster entry — during champion selection (R3.2) or
 * during an internal lookup (`Champion.getAbility()`, `ChampionRoster.getById()`).
 */
export class InvalidChampionSelectionError extends ArenaError {
  readonly code = 'INVALID_CHAMPION_SELECTION';

  /** @param championId - the id that failed to resolve */
  constructor(championId: string) {
    super(`"${championId}" is not a champion in the roster.`);
  }
}
