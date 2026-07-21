import { ChampionId } from './ids';
import { Ability } from './Ability';
import { NotImplementedError } from '../util/NotImplementedError';

export class Champion {
  constructor(
    public readonly id: ChampionId,
    public readonly name: string,
    public readonly role: string,
    public readonly maxHealth: number,
    public readonly maxResource: number,
    public readonly resourceRegenRate: number,
    public readonly moveSpeed: number,
    public readonly abilities: Ability[],
  ) {}

  /** @throws InvalidChampionSelectionError if abilityId is not one of this champion's abilities. */
  getAbility(abilityId: string): Ability {
    throw new NotImplementedError('Champion.getAbility not yet implemented');
  }
}
