import { ChampionId } from './ids';
import { Champion } from './Champion';
import { NotImplementedError } from '../util/NotImplementedError';

/** The fixed three-champion roster — Korr, Vex, Rin (docs/01_class_list.md §1.4 / SRS Appendix B). */
export class ChampionRoster {
  private static readonly champions: Champion[] = [];

  /** @returns every champion in the fixed roster, in a stable order */
  static getAll(): Champion[] {
    throw new NotImplementedError('ChampionRoster.getAll not yet implemented');
  }

  /**
   * Looks up a champion definition by id.
   * @param id - the champion identifier to resolve
   * @returns the matching Champion
   * @throws {InvalidChampionSelectionError} if id does not match any champion in the roster
   */
  static getById(id: ChampionId): Champion {
    throw new NotImplementedError('ChampionRoster.getById not yet implemented');
  }
}
