import { ChampionId } from './ids';
import { Champion } from './Champion';
import { NotImplementedError } from '../util/NotImplementedError';

/** The fixed three-champion roster — Korr, Vex, Rin (docs/01_class_list.md §1.4 / SRS Appendix B). */
export class ChampionRoster {
  private static readonly champions: Champion[] = [];

  static getAll(): Champion[] {
    throw new NotImplementedError('ChampionRoster.getAll not yet implemented');
  }

  /** @throws InvalidChampionSelectionError if id is not a known champion. */
  static getById(id: ChampionId): Champion {
    throw new NotImplementedError('ChampionRoster.getById not yet implemented');
  }
}
