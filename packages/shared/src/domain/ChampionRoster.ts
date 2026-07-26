import { ChampionId } from './ids';
import { Champion } from './Champion';
import { Ability } from './Ability';
import { EffectType } from './EffectType';
import { InvalidChampionSelectionError } from '../exceptions/InvalidChampionSelectionError';

/**
 * The fixed three-champion roster — Korr, Vex, Rin (docs/01_class_list.md §1.4 / SRS Appendix B).
 *
 * Ability numbers (cooldowns, resource costs, ranges, magnitudes) are original content invented for this
 * project — SRS Appendix B names the abilities but does not give numbers, and none existed anywhere in
 * this codebase before this class. Design intent, so future balance changes stay internally consistent:
 * Korr (180 HP bruiser) attacks cheaply and often — low cost, short cooldown, low magnitude, melee range —
 * so he wins by attrition, not burst. Vex (85 HP glass cannon) is the opposite: Arcane Bolt is the highest
 * single-hit magnitude in the roster, at the highest cost and longest range, on a longer cooldown; she is
 * compensated with the fastest resource regen so her burst window is recoverable, not spammable. Rin
 * (130 HP sustain duelist) sits in the middle on every axis and is the only champion whose kit both damages
 * and heals from the same melee range, matching her "sustain" identity. Every champion has exactly one
 * DAMAGE ability (no auto-attack exists, so a kit without one could never win by elimination — SRS Appendix
 * B). POSITIONING abilities (gap-closers/blinks) carry magnitude 0 — the effect is the reposition itself,
 * not a magnitude MatchModel needs to scale.
 */
export class ChampionRoster {
  private static readonly champions: Champion[] = [
    new Champion('korr', 'Korr', 'Bruiser / Control', 180, 100, 8, 180, [
      new Ability('crushing-blow', 'Crushing Blow', 2, 10, 75, EffectType.DAMAGE, 18),
      new Ability('shockwave-slam', 'Shockwave Slam', 12, 30, 150, EffectType.CROWD_CONTROL, 1.5),
      new Ability('iron-skin', 'Iron Skin', 15, 30, 0, EffectType.HEAL, 25),
      new Ability('bulwark-charge', 'Bulwark Charge', 8, 20, 400, EffectType.POSITIONING, 0),
    ]),
    new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 12, 220, [
      new Ability('arcane-bolt', 'Arcane Bolt', 4, 35, 600, EffectType.DAMAGE, 32),
      new Ability('frost-lance', 'Frost Lance', 10, 30, 500, EffectType.CROWD_CONTROL, 2),
      new Ability('phase-step', 'Phase Step', 9, 25, 300, EffectType.POSITIONING, 0),
    ]),
    new Champion('rin', 'Rin', 'Sustain Duelist', 130, 100, 10, 200, [
      new Ability('rending-strike', 'Rending Strike', 3, 15, 100, EffectType.DAMAGE, 22),
      new Ability('vital-siphon', 'Vital Siphon', 9, 25, 100, EffectType.HEAL, 18),
      new Ability('swift-reposition', 'Swift Reposition', 7, 15, 350, EffectType.POSITIONING, 0),
    ]),
  ];

  /** @returns every champion in the fixed roster, in a stable order */
  static getAll(): Champion[] {
    return [...ChampionRoster.champions];
  }

  /**
   * Looks up a champion definition by id.
   * @param id - the champion identifier to resolve
   * @returns the matching Champion
   * @throws {InvalidChampionSelectionError} if id does not match any champion in the roster
   */
  static getById(id: ChampionId): Champion {
    const champion = ChampionRoster.champions.find((c) => c.id === id);
    if (!champion) throw new InvalidChampionSelectionError(id);
    return champion;
  }
}
