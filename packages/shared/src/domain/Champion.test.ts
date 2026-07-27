import { Champion } from './Champion';
import { Ability } from './Ability';
import { EffectType } from './EffectType';
import { InvalidChampionSelectionError } from '../exceptions/InvalidChampionSelectionError';

function makeChampion(): Champion {
  return new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 12, 220, [
    new Ability('arcane-bolt', 'Arcane Bolt', 4, 35, 600, EffectType.DAMAGE, 32),
    new Ability('phase-step', 'Phase Step', 9, 25, 300, EffectType.POSITIONING, 0),
  ]);
}

describe('Champion', () => {
  describe('getAbility', () => {
    it('returns the matching ability by id', () => {
      const champion = makeChampion();
      const ability = champion.getAbility('arcane-bolt');
      expect(ability.name).toBe('Arcane Bolt');
      expect(ability.effectType).toBe(EffectType.DAMAGE);
    });

    it('throws InvalidChampionSelectionError for an id not in this champion\'s kit', () => {
      const champion = makeChampion();
      expect(() => champion.getAbility('nonexistent')).toThrow(InvalidChampionSelectionError);
    });
  });
});
