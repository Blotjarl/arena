import { ChampionId } from './ids';
import { Ability } from './Ability';
import { NotImplementedError } from '../util/NotImplementedError';

/** A selectable character with fixed stats and abilities (SRS Appendix B — Korr, Vex, Rin). */
export class Champion {
  constructor(
    /** Roster identifier, matches a `ChampionId` used throughout the contract and domain layer. */
    public readonly id: ChampionId,
    /** Display name shown in the client UI. */
    public readonly name: string,
    /** Descriptive role label (e.g. `'Bruiser / Control'`). */
    public readonly role: string,
    /** Maximum health points. */
    public readonly maxHealth: number,
    /** Maximum resource points (mana/energy-equivalent). */
    public readonly maxResource: number,
    /** Resource regained per second while alive. */
    public readonly resourceRegenRate: number,
    /** Movement speed in arena units per second. */
    public readonly moveSpeed: number,
    /** This champion's fixed kit. */
    public readonly abilities: Ability[],
  ) {}

  /**
   * Looks up one of this champion's abilities by id.
   * @param abilityId - the ability identifier to resolve
   * @returns the matching Ability
   * @throws {InvalidChampionSelectionError} if abilityId is not one of this champion's abilities
   */
  getAbility(abilityId: string): Ability {
    throw new NotImplementedError('Champion.getAbility not yet implemented');
  }
}
