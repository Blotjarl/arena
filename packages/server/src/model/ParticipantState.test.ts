import {
  Team,
  Champion,
  Ability,
  EffectType,
  ConnectionStatus,
  ActorIncapacitatedError,
  AbilityOnCooldownError,
  InsufficientResourceError,
} from '@arena/shared';
import { ParticipantState } from './ParticipantState';

function makeChampion(): Champion {
  return new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 10, 200, [
    new Ability('bolt', 'Bolt', 5, 20, 500, EffectType.DAMAGE, 30),
    new Ability('cheap', 'Cheap Poke', 0.5, 5, 500, EffectType.DAMAGE, 5),
  ]);
}

function makeParticipant(): ParticipantState {
  const p = new ParticipantState('player-1', Team.A);
  p.champion = makeChampion();
  p.health = 85;
  p.resource = 100;
  return p;
}

describe('ParticipantState', () => {
  describe('constructor', () => {
    it('starts with position (0,0), zero health/resource, no champion, connected', () => {
      const p = new ParticipantState('player-1', Team.A);
      expect(p.playerId).toBe('player-1');
      expect(p.team).toBe(Team.A);
      expect(p.champion).toBeNull();
      expect(p.position.x).toBe(0);
      expect(p.position.y).toBe(0);
      expect(p.health).toBe(0);
      expect(p.resource).toBe(0);
      expect(p.connectionStatus).toBe(ConnectionStatus.CONNECTED);
    });
  });

  describe('applyDamage', () => {
    it('subtracts from health', () => {
      const p = makeParticipant();
      p.applyDamage(30);
      expect(p.health).toBe(55);
    });

    it('clamps at zero on overkill', () => {
      const p = makeParticipant();
      p.applyDamage(1000);
      expect(p.health).toBe(0);
    });
  });

  describe('applyHeal', () => {
    it('adds to health', () => {
      const p = makeParticipant();
      p.health = 50;
      p.applyHeal(20);
      expect(p.health).toBe(70);
    });

    it('clamps at champion max health', () => {
      const p = makeParticipant();
      p.health = 80;
      p.applyHeal(100);
      expect(p.health).toBe(85);
    });
  });

  describe('applyCrowdControl', () => {
    it('sets an expiry relative to now', () => {
      const p = makeParticipant();
      p.applyCrowdControl(2000, 1000);
      expect(p.canUseAbility('bolt', 2999)).toBe(false);
      expect(p.canUseAbility('bolt', 3001)).toBe(true);
    });

    it('never shortens an existing longer window (stacking extends, does not reset)', () => {
      const p = makeParticipant();
      p.applyCrowdControl(5000, 1000); // expires at 6000
      p.applyCrowdControl(1000, 1000); // would expire at 2000 -- must not shorten
      expect(p.canUseAbility('bolt', 3000)).toBe(false); // still CC'd from the first application
    });
  });

  describe('regenerateResource', () => {
    it('adds rate * deltaSeconds, clamped at max', () => {
      const p = makeParticipant();
      p.resource = 90;
      p.regenerateResource(0.5); // rate 10/s * 0.5s = 5
      expect(p.resource).toBe(95);
      p.regenerateResource(10); // would overflow past 100
      expect(p.resource).toBe(100);
    });

    it('is a no-op before champion selection', () => {
      const p = new ParticipantState('player-1', Team.A);
      p.resource = 0;
      p.regenerateResource(5);
      expect(p.resource).toBe(0);
    });
  });

  describe('canUseAbility', () => {
    it('true when ready', () => {
      const p = makeParticipant();
      expect(p.canUseAbility('bolt', 1000)).toBe(true);
    });

    it('false before a champion has been selected', () => {
      const p = new ParticipantState('player-1', Team.A);
      expect(p.canUseAbility('bolt', 1000)).toBe(false);
    });

    it('false for an unknown ability id', () => {
      const p = makeParticipant();
      expect(p.canUseAbility('nonexistent', 1000)).toBe(false);
    });

    it('false when on cooldown', () => {
      const p = makeParticipant();
      p.useAbility(p.champion!.abilities[0], 1000);
      expect(p.canUseAbility('bolt', 1500)).toBe(false);
    });

    it('false when resource is insufficient', () => {
      const p = makeParticipant();
      p.resource = 10;
      expect(p.canUseAbility('bolt', 1000)).toBe(false);
    });

    it('false when dead', () => {
      const p = makeParticipant();
      p.health = 0;
      expect(p.canUseAbility('bolt', 1000)).toBe(false);
    });

    it('false when crowd-controlled', () => {
      const p = makeParticipant();
      p.applyCrowdControl(5000, 1000);
      expect(p.canUseAbility('bolt', 2000)).toBe(false);
    });
  });

  describe('useAbility', () => {
    it("sets cooldown and deducts resource on success (using the caster's own champion instance)", () => {
      const p = makeParticipant();
      const bolt = p.champion!.abilities[0];
      p.useAbility(bolt, 1000);
      expect(p.resource).toBe(80);
      expect(p.canUseAbility('bolt', 1000)).toBe(false);
      expect(p.canUseAbility('bolt', 1000 + 5000)).toBe(true);
    });

    it('throws AbilityOnCooldownError when on cooldown', () => {
      const p = makeParticipant();
      const bolt = makeChampion().abilities[0];
      p.useAbility(bolt, 1000);
      expect(() => p.useAbility(bolt, 1200)).toThrow(AbilityOnCooldownError);
    });

    it('throws InsufficientResourceError when under cost', () => {
      const p = makeParticipant();
      p.resource = 5;
      const bolt = makeChampion().abilities[0];
      expect(() => p.useAbility(bolt, 1000)).toThrow(InsufficientResourceError);
    });

    it('throws ActorIncapacitatedError when dead', () => {
      const p = makeParticipant();
      p.health = 0;
      const bolt = makeChampion().abilities[0];
      expect(() => p.useAbility(bolt, 1000)).toThrow(ActorIncapacitatedError);
    });

    it('throws ActorIncapacitatedError when crowd-controlled', () => {
      const p = makeParticipant();
      p.applyCrowdControl(5000, 1000);
      const bolt = makeChampion().abilities[0];
      expect(() => p.useAbility(bolt, 2000)).toThrow(ActorIncapacitatedError);
    });

    it('checks incapacitation before cooldown/resource (a dead caster reports incapacitated, not on-cooldown)', () => {
      const p = makeParticipant();
      const bolt = p.champion!.abilities[0];
      p.useAbility(bolt, 1000); // now on cooldown
      p.health = 0; // and dead
      expect(() => p.useAbility(bolt, 1200)).toThrow(ActorIncapacitatedError);
    });
  });

  describe('move', () => {
    it('moves position scaled by champion speed and deltaSeconds', () => {
      const p = makeParticipant(); // moveSpeed 200
      p.move({ dx: 1, dy: 0 }, 0.5, 1000); // 200 * 0.5 = 100
      expect(p.position.x).toBe(100);
      expect(p.position.y).toBe(0);
    });

    it('throws ActorIncapacitatedError when dead', () => {
      const p = makeParticipant();
      p.health = 0;
      expect(() => p.move({ dx: 1, dy: 0 }, 0.5, 1000)).toThrow(ActorIncapacitatedError);
    });

    it('throws ActorIncapacitatedError when crowd-controlled', () => {
      const p = makeParticipant();
      p.applyCrowdControl(5000, 1000);
      expect(() => p.move({ dx: 1, dy: 0 }, 0.5, 2000)).toThrow(ActorIncapacitatedError);
    });
  });

  describe('isAlive', () => {
    it('true when health > 0, false at 0', () => {
      const p = makeParticipant();
      expect(p.isAlive()).toBe(true);
      p.health = 0;
      expect(p.isAlive()).toBe(false);
    });
  });

  describe('toSnapshot', () => {
    it('reflects current state', () => {
      const p = makeParticipant();
      const snap = p.toSnapshot(1000);
      expect(snap.playerId).toBe('player-1');
      expect(snap.team).toBe(Team.A);
      expect(snap.championId).toBe('vex');
      expect(snap.health).toBe(85);
      expect(snap.resource).toBe(100);
      expect(snap.cooldownsRemaining).toEqual({});
      expect(snap.crowdControlled).toBe(false);
      expect(snap.alive).toBe(true);
    });

    it('includes remaining cooldown seconds only for abilities actually on cooldown', () => {
      const p = makeParticipant();
      const bolt = p.champion!.abilities[0];
      p.useAbility(bolt, 1000); // ready again at 6000
      const snap = p.toSnapshot(4000);
      expect(snap.cooldownsRemaining.bolt).toBeCloseTo(2, 5);
    });

    it('reports crowdControlled true while the window is active', () => {
      const p = makeParticipant();
      p.applyCrowdControl(3000, 1000);
      expect(p.toSnapshot(2000).crowdControlled).toBe(true);
      expect(p.toSnapshot(4001).crowdControlled).toBe(false);
    });
  });
});
