import {
  Team,
  Champion,
  Ability,
  EffectType,
  ConnectionStatus,
  ActorIncapacitatedError,
  AbilityOnCooldownError,
  InsufficientResourceError,
  Position,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ARENA_OBSTACLES,
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

    describe('CORRECTION (Step 11): arena wall clamping', () => {
      it('a normal movement well within bounds is completely unaffected by the clamp', () => {
        const p = makeParticipant(); // moveSpeed 200
        p.position = new Position(ARENA_WIDTH / 2, ARENA_HEIGHT / 2);
        p.move({ dx: 1, dy: 0 }, 0.1, 1000); // 200 * 0.1 = 20, nowhere near a wall
        expect(p.position.x).toBe(ARENA_WIDTH / 2 + 20);
        expect(p.position.y).toBe(ARENA_HEIGHT / 2);
      });

      it('repeated movement toward the right wall stops exactly at ARENA_WIDTH, not beyond it', () => {
        const p = makeParticipant();
        p.position = new Position(ARENA_WIDTH - 10, ARENA_HEIGHT / 2);
        for (let i = 0; i < 5; i++) {
          p.move({ dx: 1, dy: 0 }, 1, 1000 + i); // 200/s -- would massively overshoot without clamping
        }
        expect(p.position.x).toBe(ARENA_WIDTH);
      });

      it('repeated movement toward the left wall stops exactly at 0, not beyond it', () => {
        const p = makeParticipant();
        p.position = new Position(10, ARENA_HEIGHT / 2);
        for (let i = 0; i < 5; i++) {
          p.move({ dx: -1, dy: 0 }, 1, 1000 + i);
        }
        expect(p.position.x).toBe(0);
      });

      it('repeated movement toward the bottom wall stops exactly at ARENA_HEIGHT, not beyond it', () => {
        const p = makeParticipant();
        p.position = new Position(ARENA_WIDTH / 2, ARENA_HEIGHT - 10);
        for (let i = 0; i < 5; i++) {
          p.move({ dx: 0, dy: 1 }, 1, 1000 + i);
        }
        expect(p.position.y).toBe(ARENA_HEIGHT);
      });

      it('repeated movement toward the top wall stops exactly at 0, not beyond it', () => {
        const p = makeParticipant();
        p.position = new Position(ARENA_WIDTH / 2, 10);
        for (let i = 0; i < 5; i++) {
          p.move({ dx: 0, dy: -1 }, 1, 1000 + i);
        }
        expect(p.position.y).toBe(0);
      });
    });

    describe('CORRECTION (Step 11, 11_server_3): server-authoritative obstacles', () => {
      const [leftPillar, rightPillar, topBlock] = ARENA_OBSTACLES;
      // 200 moveSpeed * 0.025s = 5 per tick -- fine-grained enough to approach an obstacle without a
      // single tick's movement jumping clean over it (unlike the coarse 1s ticks the wall-clamp tests
      // above use, which would skip past these smaller obstacles entirely).
      const STEP_DELTA_SECONDS = 0.025;

      it('repeated movement toward the left pillar from the right stops before entering it, not inside or beyond', () => {
        const p = makeParticipant(); // moveSpeed 200
        p.position = new Position(leftPillar.x + leftPillar.width + 20, leftPillar.y + leftPillar.height / 2);
        for (let i = 0; i < 8; i++) {
          p.move({ dx: -1, dy: 0 }, STEP_DELTA_SECONDS, 1000 + i);
        }
        expect(p.position.x).toBe(leftPillar.x + leftPillar.width + 5); // one 5-unit step short of the edge
      });

      it('repeated movement toward the right pillar from the left stops before entering it', () => {
        const p = makeParticipant();
        p.position = new Position(rightPillar.x - 20, rightPillar.y + rightPillar.height / 2);
        for (let i = 0; i < 8; i++) {
          p.move({ dx: 1, dy: 0 }, STEP_DELTA_SECONDS, 1000 + i);
        }
        expect(p.position.x).toBe(rightPillar.x - 5);
      });

      it('repeated movement toward the top block from below stops before entering it', () => {
        const p = makeParticipant();
        p.position = new Position(topBlock.x + topBlock.width / 2, topBlock.y + topBlock.height + 20);
        for (let i = 0; i < 8; i++) {
          p.move({ dx: 0, dy: -1 }, STEP_DELTA_SECONDS, 1000 + i);
        }
        expect(p.position.y).toBe(topBlock.y + topBlock.height + 5);
      });

      it('repeated movement into the left pillar from directly above (a different approach axis) stops before entering it', () => {
        const p = makeParticipant();
        p.position = new Position(leftPillar.x + leftPillar.width / 2, leftPillar.y - 20);
        for (let i = 0; i < 8; i++) {
          p.move({ dx: 0, dy: 1 }, STEP_DELTA_SECONDS, 1000 + i);
        }
        expect(p.position.y).toBe(leftPillar.y - 5);
      });

      it('a single large movement that would jump clean into a pillar from just outside it is also rejected, not just slow approaches', () => {
        const p = makeParticipant();
        p.position = new Position(leftPillar.x - 5, leftPillar.y + leftPillar.height / 2);
        p.move({ dx: 1, dy: 0 }, 0.15, 1000); // 200 * 0.15 = 30 -- lands inside the pillar (width 50), not beyond it
        expect(p.position.x).toBe(leftPillar.x - 5); // move rejected outright; participant stays put
      });

      it('movement well clear of every obstacle is completely unaffected (no false-positive blocking)', () => {
        const p = makeParticipant(); // moveSpeed 200
        p.position = new Position(ARENA_WIDTH / 2, ARENA_HEIGHT / 2); // dead center, in the gap between pillars
        p.move({ dx: 1, dy: 0 }, 0.1, 1000); // 200 * 0.1 = 20 -- stays in the gap, nowhere near a pillar
        expect(p.position.x).toBe(ARENA_WIDTH / 2 + 20);
        expect(p.position.y).toBe(ARENA_HEIGHT / 2);
      });

      it('movement clear across the near-empty bottom half of the arena is completely unaffected', () => {
        const p = makeParticipant();
        p.position = new Position(ARENA_WIDTH / 2, ARENA_HEIGHT - 50);
        p.move({ dx: 1, dy: 0 }, 0.5, 1000); // 200 * 0.5 = 100, well below every obstacle's y-range
        expect(p.position.x).toBe(ARENA_WIDTH / 2 + 100);
        expect(p.position.y).toBe(ARENA_HEIGHT - 50);
      });
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
