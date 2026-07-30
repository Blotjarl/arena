import { EffectType } from './EffectType';

/** A single champion-specific action: a cooldown, a resource cost, and one effect (SRS 1.4). */
export class Ability {
  constructor(
    /** Identifier unique within the owning champion's kit (e.g. `'crushing-blow'`). */
    public readonly id: string,
    /** Display name shown in the client UI. */
    public readonly name: string,
    /** Minimum time, in seconds, between two uses of this ability by the same player. */
    public readonly cooldownSeconds: number,
    /** Amount of the caster's resource this ability consumes per use. */
    public readonly resourceCost: number,
    /** Maximum distance from the caster this ability can target. */
    public readonly range: number,
    /** Which kind of effect this ability produces on use. */
    public readonly effectType: EffectType,
    /** The effect's strength — damage/heal amount, stun duration, etc., interpreted per `effectType`. */
    public readonly magnitude: number,
    /**
     * Short flavor text describing what this ability does, shown as a hover tooltip in both Champion
     * Select and the match HUD (Step 11, 11_cross_1). Purely descriptive/cosmetic — never read by any
     * game-logic code, unlike every other field on this class.
     */
    public readonly description: string,
  ) {}
}
