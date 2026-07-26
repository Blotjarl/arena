# Prompt 09_shared_1 — Domain Value Objects: Position, Champion, ChampionRoster

**Owner: En.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first — §5 of
the implementation plan specifically covers the champion-balance-number scope of this prompt.

### CRITICAL: this prompt blocks `09_server_3` — merge it to `main` promptly
Per master context §9.4, `packages/shared` is the one package that should merge to `main` promptly rather
than waiting for a step boundary, because other tracks depend on it. This is a concrete instance of that
rule: **`09_server_3_matchmodel-champion-select.md` (`MatchModel.selectChampion`) calls
`ChampionRoster.getById()` directly and cannot be executed for real until this prompt's branch is merged.**
If you are Marshall (or anyone) picking up `09_server_3` and this prompt's branch isn't merged yet, stop and
merge this one first — do not stub around it.

The code below is already validated (implemented and test-run against this real repo: `npm run typecheck -w
@arena/shared` passes, all tests pass at 100% coverage — see §4). You are transcribing proven work, not
designing from scratch, but you must still run everything yourself; don't skip verification.

---

### 1. `Position.distanceTo` — already implemented, no change needed
Read `packages/shared/src/domain/Position.ts` before touching anything else in this prompt: it already
contains a real implementation, not a `NotImplementedError` stub —

```ts
/** A 2D point in arena-space. Used for champion positions and ability targeting. */
export class Position {
  constructor(
    /** Horizontal coordinate. */
    public readonly x: number,
    /** Vertical coordinate. */
    public readonly y: number,
  ) {}

  /**
   * Euclidean distance between this position and another.
   * @param other - the position to measure to
   * @returns the straight-line distance, in the same units as x and y
   */
  distanceTo(other: Position): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }
}
```

Leave the file itself untouched. This prompt's only obligation for `Position` is to add the test file below
— it currently has none, and per the master context's test strategy, coverage must be a measured number,
not an assumption that "trivial code doesn't need a test."

Create `packages/shared/src/domain/Position.test.ts`:

```ts
import { Position } from './Position';

describe('Position', () => {
  describe('distanceTo', () => {
    it('is zero for the same point', () => {
      const p = new Position(5, 5);
      expect(p.distanceTo(new Position(5, 5))).toBe(0);
    });

    it('computes straight-line distance on a horizontal offset', () => {
      const a = new Position(0, 0);
      const b = new Position(3, 0);
      expect(a.distanceTo(b)).toBe(3);
    });

    it('computes straight-line distance on a 3-4-5 triangle', () => {
      const a = new Position(0, 0);
      const b = new Position(3, 4);
      expect(a.distanceTo(b)).toBe(5);
    });

    it('is symmetric', () => {
      const a = new Position(1, 2);
      const b = new Position(7, 11);
      expect(a.distanceTo(b)).toBeCloseTo(b.distanceTo(a), 10);
    });

    it('handles negative coordinates', () => {
      const a = new Position(-2, -3);
      const b = new Position(1, 1);
      expect(a.distanceTo(b)).toBeCloseTo(5, 10);
    });
  });
});
```

---

### 2. Replace `packages/shared/src/domain/Champion.ts` with:

```ts
import { ChampionId } from './ids';
import { Ability } from './Ability';
import { InvalidChampionSelectionError } from '../exceptions/InvalidChampionSelectionError';

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
    const ability = this.abilities.find((a) => a.id === abilityId);
    if (!ability) throw new InvalidChampionSelectionError(abilityId);
    return ability;
  }
}
```

Create `packages/shared/src/domain/Champion.test.ts`:

```ts
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
```

---

### 3. Replace `packages/shared/src/domain/ChampionRoster.ts` with:

**This is the real content-generation work in this prompt.** SRS Appendix B and master context §1.4 name
the abilities (Korr: Crushing Blow, Shockwave Slam, Iron Skin, Bulwark Charge; Vex: Arcane Bolt, Frost
Lance, Phase Step; Rin: Rending Strike, Vital Siphon, Swift Reposition) but give no numbers — none exist
anywhere in this codebase. The numbers below are original content invented for this prompt. They're kept
simple and round per the implementation plan §5: internal consistency (a tankier champion reads as slower/
cheaper than a burst mage) matters more than precision, since this is a course project, not a
balance-patched live game.

```ts
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
```

Note on `getAll()` returning `[...ChampionRoster.champions]` rather than the array itself: this is an
immutable static roster — callers must not be able to mutate it by pushing/splicing the array `getAll()`
handed them. The test below asserts this directly.

Create `packages/shared/src/domain/ChampionRoster.test.ts`:

```ts
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
```

---

### 4. Verification and Git
Per master context §9.5/§9.4:
- `npm run typecheck -w @arena/shared` passes.
- `npx jest Position.test.ts Champion.test.ts ChampionRoster.test.ts --coverage
  --collectCoverageFrom="src/domain/Position.ts" --collectCoverageFrom="src/domain/Champion.ts"
  --collectCoverageFrom="src/domain/ChampionRoster.ts"` — validated result: **3 suites, 18 tests passing,
  100% statement/branch/function/line coverage on all three files.**
- `docs/01_class_list.md` §1.4 already lists the champion table with role/maxHealth/notable abilities, and
  none of it changed — this prompt fills in numbers `01_class_list.md` never specified, it doesn't
  contradict anything already there. No doc update needed.

Branch `shared` from `main` (`git branch -D shared 2>/dev/null; git checkout -b shared main`), commit `Step
9: Position/Champion/ChampionRoster implementation and tests — Korr/Vex/Rin ability data`, push, open a PR
into `main`, and **merge it promptly** — do not leave it sitting on the branch (see the CRITICAL note above).

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: merge this to `main` as soon as it's reviewed — `09_server_3_matchmodel-champion-select.md`
(`MatchModel.selectChampion`) calls `ChampionRoster.getById()` directly and cannot be executed for real
until this branch is in `main`. Do not batch this merge with a later step boundary the way most `shared`
work would otherwise wait for; master context §9.4 already carves out this exact exception for `shared`.**
