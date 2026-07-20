import { EffectType } from './EffectType';

export class Ability {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly cooldownSeconds: number,
    public readonly resourceCost: number,
    public readonly range: number,
    public readonly effectType: EffectType,
    public readonly magnitude: number,
  ) {}
}
