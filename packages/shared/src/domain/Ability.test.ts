import { Ability } from './Ability';
import { EffectType } from './EffectType';

describe('Ability', () => {
  it('stores every constructor field exactly as given, including the new description field (11_cross_1)', () => {
    const a = new Ability('bolt', 'Arcane Bolt', 4, 35, 600, EffectType.DAMAGE, 32, 'A burst of arcane energy.');

    expect(a.id).toBe('bolt');
    expect(a.name).toBe('Arcane Bolt');
    expect(a.cooldownSeconds).toBe(4);
    expect(a.resourceCost).toBe(35);
    expect(a.range).toBe(600);
    expect(a.effectType).toBe(EffectType.DAMAGE);
    expect(a.magnitude).toBe(32);
    expect(a.description).toBe('A burst of arcane energy.');
  });
});
