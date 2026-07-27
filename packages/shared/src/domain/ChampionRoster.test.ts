import { ChampionRoster } from './ChampionRoster';
import { EffectType } from './EffectType';
import { InvalidChampionSelectionError } from '../exceptions/InvalidChampionSelectionError';

describe('ChampionRoster', () => {
  describe('getAll', () => {
    it('returns all three champions, in a stable order', () => {
      const all = ChampionRoster.getAll();
      expect(all.map((c) => c.id)).toEqual(['korr', 'vex', 'rin']);
    });

    it('returns a fresh array each call, not an internal reference (callers cannot mutate the roster)', () => {
      const first = ChampionRoster.getAll();
      first.push(first[0]);
      expect(ChampionRoster.getAll()).toHaveLength(3);
    });

    it('every champion has at least one DAMAGE ability (no auto-attack exists in this system)', () => {
      for (const champion of ChampionRoster.getAll()) {
        expect(champion.abilities.some((a) => a.effectType === EffectType.DAMAGE)).toBe(true);
      }
    });
  });

  describe('getById', () => {
    it.each([
      ['korr', 180],
      ['vex', 85],
      ['rin', 130],
    ])('resolves %s with maxHealth %i', (id, maxHealth) => {
      expect(ChampionRoster.getById(id).maxHealth).toBe(maxHealth);
    });

    it('throws InvalidChampionSelectionError for an unknown id', () => {
      expect(() => ChampionRoster.getById('nonexistent')).toThrow(InvalidChampionSelectionError);
    });
  });

  describe('roster balance shape (documents the invented numbers stay internally consistent)', () => {
    it('Korr is the tankiest and has the lowest-magnitude, lowest-cost damage ability', () => {
      const korr = ChampionRoster.getById('korr');
      const vex = ChampionRoster.getById('vex');
      const rin = ChampionRoster.getById('rin');
      expect(korr.maxHealth).toBeGreaterThan(rin.maxHealth);
      expect(rin.maxHealth).toBeGreaterThan(vex.maxHealth);

      const korrDamage = korr.getAbility('crushing-blow');
      const vexDamage = vex.getAbility('arcane-bolt');
      const rinDamage = rin.getAbility('rending-strike');
      expect(korrDamage.magnitude).toBeLessThan(rinDamage.magnitude);
      expect(rinDamage.magnitude).toBeLessThan(vexDamage.magnitude);
      expect(korrDamage.resourceCost).toBeLessThan(vexDamage.resourceCost);
    });

    it('Vex has the longest damage-ability range and the fastest resource regen', () => {
      const korr = ChampionRoster.getById('korr');
      const vex = ChampionRoster.getById('vex');
      const rin = ChampionRoster.getById('rin');
      expect(vex.getAbility('arcane-bolt').range).toBeGreaterThan(korr.getAbility('crushing-blow').range);
      expect(vex.getAbility('arcane-bolt').range).toBeGreaterThan(rin.getAbility('rending-strike').range);
      expect(vex.resourceRegenRate).toBeGreaterThan(korr.resourceRegenRate);
      expect(vex.resourceRegenRate).toBeGreaterThan(rin.resourceRegenRate);
    });

    it('Rin is the only champion whose kit both damages and heals at melee range', () => {
      const rin = ChampionRoster.getById('rin');
      const damage = rin.getAbility('rending-strike');
      const heal = rin.getAbility('vital-siphon');
      expect(damage.range).toBeLessThanOrEqual(100);
      expect(heal.range).toBeLessThanOrEqual(100);
      expect(heal.effectType).toBe(EffectType.HEAL);
    });

    it('every POSITIONING ability carries magnitude 0 (the reposition is the effect)', () => {
      for (const champion of ChampionRoster.getAll()) {
        for (const ability of champion.abilities.filter((a) => a.effectType === EffectType.POSITIONING)) {
          expect(ability.magnitude).toBe(0);
        }
      }
    });
  });
});
