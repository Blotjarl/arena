import {
  Team,
  MatchPhase,
  EndReason,
  Player,
  Champion,
  Ability,
  EffectType,
  ChampionRoster,
  ModelListener,
  ConnectionStatus,
  Position,
  GracePeriodExpiredError,
  InvalidMatchPhaseError,
  SelectionWindowExpiredError,
  InvalidChampionSelectionError,
  ARENA_WIDTH,
  ARENA_OBSTACLES,
  isWithinObstacle,
} from '@arena/shared';
import { MatchModel } from './MatchModel';

const SPAWN_P1_X = 50; // must match MatchModel's SPAWN_WALL_MARGIN
const SPAWN_P2_X = 670; // must match MatchModel's ARENA_WIDTH - SPAWN_WALL_MARGIN (CORRECTION 11_cross_1: ARENA_WIDTH is now 720)

const VEX = new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 10, 200, [
  new Ability('bolt', 'Arcane Bolt', 5, 20, 500, EffectType.DAMAGE, 30, 'A burst of arcane energy.'),
  new Ability('heal', 'Self Mend', 8, 30, 0, EffectType.HEAL, 15, 'A self-heal.'),
  new Ability('root', 'Frost Lance', 6, 25, 400, EffectType.CROWD_CONTROL, 1.5, 'Freezes the target.'),
  new Ability('blink', 'Phase Step', 10, 20, 300, EffectType.POSITIONING, 0, 'A short blink.'),
  // Real ability ids (11_cross_2 Scope E) -- MatchModel.submitAbility special-cases these four exact
  // ids, so the fixture needs abilities carrying them, distinct from the generic 'root'/'blink' above.
  new Ability('shockwave-slam', 'Shockwave Slam', 12, 30, 150, EffectType.CROWD_CONTROL, 1.5, 'An arc-shaped shockwave.'),
  new Ability('bulwark-charge', 'Bulwark Charge', 8, 20, 300, EffectType.POSITIONING, 0, 'A shoulder-first charge.'),
  new Ability('phase-step', 'Phase Step', 9, 25, 300, EffectType.POSITIONING, 0, 'A teleport between spaces.'),
  new Ability('vital-siphon', 'Vital Siphon', 9, 25, 100, EffectType.HEAL, 18, 'A draining melee strike.'),
]);

function makePlayers(): [Player, Player] {
  return [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
}

function selectBothChampions(match: MatchModel): void {
  match.selectChampion('p1', 'vex');
  match.selectChampion('p2', 'vex');
}

function collectEvents(match: MatchModel): { type: string; payload: unknown }[] {
  const events: { type: string; payload: unknown }[] = [];
  const listener: ModelListener = { modelChanged: (e) => events.push({ type: e.type, payload: e.payload }) };
  match.addModelListener(listener);
  return events;
}

describe('MatchModel', () => {
  beforeEach(() => {
    jest.spyOn(ChampionRoster, 'getById').mockImplementation((id: string) => {
      if (id === 'vex') return VEX;
      throw new InvalidChampionSelectionError(id);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('construction', () => {
    it('starts in CHAMPION_SELECT with a 30s deadline', () => {
      const before = Date.now();
      const match = new MatchModel('m1', makePlayers());
      expect(match.phase).toBe(MatchPhase.CHAMPION_SELECT);
      expect(match.championSelectDeadline).toBeGreaterThanOrEqual(before + 30_000);
      expect(match.championSelectDeadline).toBeLessThan(before + 31_000);
    });
  });

  describe('selectChampion', () => {
    it('sets the participant champion and broadcasts champion:selected', () => {
      const match = new MatchModel('m1', makePlayers());
      const events = collectEvents(match);
      match.selectChampion('p1', 'vex');
      expect(events[0].type).toBe('champion:selected');
      expect((events[0].payload as { bothSelected: boolean }).bothSelected).toBe(false);
    });

    it('sets health/resource to the champion max on selection (verified once both selected)', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const snap = match.snapshot();
      const p1 = snap.participants.find((p) => p.playerId === 'p1')!;
      expect(p1.health).toBe(85);
      expect(p1.resource).toBe(100);
    });

    it('transitions to ACTIVE and broadcasts match:start once both players have selected', () => {
      const match = new MatchModel('m1', makePlayers());
      const events = collectEvents(match);
      selectBothChampions(match);
      expect(match.phase).toBe(MatchPhase.ACTIVE);
      expect(match.startedAt).not.toBeNull();
      expect(events.some((e) => e.type === 'match:start')).toBe(true);
    });

    it('throws InvalidChampionSelectionError for an unknown champion', () => {
      const match = new MatchModel('m1', makePlayers());
      expect(() => match.selectChampion('p1', 'nope')).toThrow(InvalidChampionSelectionError);
    });

    it('throws SelectionWindowExpiredError after the 30s deadline', () => {
      const match = new MatchModel('m1', makePlayers());
      match.championSelectDeadline = Date.now() - 1;
      expect(() => match.selectChampion('p1', 'vex')).toThrow(SelectionWindowExpiredError);
    });

    it('throws InvalidMatchPhaseError once already ACTIVE', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      expect(() => match.selectChampion('p1', 'vex')).toThrow(InvalidMatchPhaseError);
    });
  });

  describe('tick — champion select phase', () => {
    it('ends the match with SELECTION_TIMEOUT once the deadline passes, without touching combat state', () => {
      const match = new MatchModel('m1', makePlayers());
      const events = collectEvents(match);
      match.championSelectDeadline = Date.now() - 1;
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.endReason).toBe(EndReason.SELECTION_TIMEOUT);
      expect(match.winningTeam).toBeNull();
      expect(events.some((e) => e.type === 'match:end')).toBe(true);
    });

    it('is a no-op before the deadline', () => {
      const match = new MatchModel('m1', makePlayers());
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.CHAMPION_SELECT);
    });
  });

  describe('snapshot', () => {
    it('includes both participants and matchId', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      expect(match.snapshot().participants).toHaveLength(2);
      expect(match.snapshot().matchId).toBe('m1');
    });
  });

  describe('constructor — spawn positions', () => {
    it('CORRECTION (Step 11): spawns the two participants at distinct positions on opposite sides of the arena, not both at (0, 0)', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match); // toSnapshot()'s precondition requires a champion to be selected first
      const snap = match.snapshot();
      const a = snap.participants.find((p) => p.playerId === 'p1')!;
      const b = snap.participants.find((p) => p.playerId === 'p2')!;
      expect(a.position).not.toEqual(b.position);
      expect(a.position).not.toEqual({ x: 0, y: 0 });
      expect(b.position).not.toEqual({ x: 0, y: 0 });
      expect(Math.abs(a.position.x - b.position.x)).toBeGreaterThan(50); // not immediately adjacent
    });

    it('CORRECTION (Step 11, 11_server_3): neither spawn position falls inside an obstacle at the widened arena', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const snap = match.snapshot();
      const a = snap.participants.find((p) => p.playerId === 'p1')!;
      const b = snap.participants.find((p) => p.playerId === 'p2')!;
      expect(a.position.x).toBe(SPAWN_P1_X);
      expect(b.position.x).toBe(SPAWN_P2_X);
      expect(SPAWN_P2_X).toBe(ARENA_WIDTH - SPAWN_P1_X);
      expect(isWithinObstacle(a.position.x, a.position.y)).toBe(false);
      expect(isWithinObstacle(b.position.x, b.position.y)).toBe(false);
      expect(ARENA_OBSTACLES.length).toBeGreaterThan(0);
    });
  });

  describe('submitMove / tick — movement', () => {
    it('buffers movement and applies it scaled by deltaSeconds on the next tick', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitMove('p1', { dx: 1, dy: 0 });
      match.tick(0.5); // vex moveSpeed 200 * 0.5 = 100
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.position.x).toBe(SPAWN_P1_X + 100);
    });

    it('CORRECTION (Step 11): a single submitMove() only moves the participant on the next tick, not every tick thereafter', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitMove('p1', { dx: 1, dy: 0 });
      match.tick(0.5); // vex moveSpeed 200 * 0.5 = 100
      match.tick(0.5); // no new submitMove -- position must not advance again
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.position.x).toBe(SPAWN_P1_X + 100);
    });

    it('throws InvalidMatchPhaseError if submitted before the match is ACTIVE', () => {
      const match = new MatchModel('m1', makePlayers());
      expect(() => match.submitMove('p1', { dx: 1, dy: 0 })).toThrow(InvalidMatchPhaseError);
    });

    it('broadcasts a state event each active tick', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      match.tick(0.05);
      expect(events.some((e) => e.type === 'state')).toBe(true);
    });
  });

  describe('submitAbility (CORRECTION, 11_cross_1: skillshot targeting via targetPosition)', () => {
    // y=400 sits clear of every ARENA_OBSTACLES rectangle (pillars end at y=276, the top block at y=84),
    // so hit-resolution tests below aren't accidentally affected by line-of-sight blocking -- that gets
    // its own dedicated tests further down, with deliberately obstacle-crossing positions.
    const CLEAR_Y = 400;

    function setPositions(match: MatchModel, p1: Position, p2: Position): void {
      const state = match as unknown as { participants: { playerId: string; position: Position }[] };
      state.participants.find((p) => p.playerId === 'p1')!.position = p1;
      state.participants.find((p) => p.playerId === 'p2')!.position = p2;
    }

    it('applies damage when aimed exactly at an in-range opponent, consuming cooldown/resource on the caster', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      setPositions(match, new Position(50, CLEAR_Y), new Position(350, CLEAR_Y)); // distance 300, bolt range 500
      match.submitAbility('p1', { abilityId: 'bolt', targetPosition: new Position(350, CLEAR_Y) }); // aimed exactly at p2
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(55); // 85 - 30
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.resource).toBe(80); // 100 - bolt's 20 cost
      expect(Object.keys(p1.cooldownsRemaining)).toContain('bolt');
    });

    it('silently ignores a skillshot aimed correctly but out of range (no effect, no throw, cost still consumed)', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      setPositions(match, new Position(50, CLEAR_Y), new Position(650, CLEAR_Y)); // distance 600 > bolt's 500 range
      expect(() =>
        match.submitAbility('p1', { abilityId: 'bolt', targetPosition: new Position(650, CLEAR_Y) }),
      ).not.toThrow();
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(85); // unaffected -- whiffed
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.resource).toBe(80); // cost still consumed on a whiffed cast (real skillshot semantics)
    });

    it('silently ignores a skillshot in range but aimed away from the opponent', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      setPositions(match, new Position(50, CLEAR_Y), new Position(150, CLEAR_Y)); // distance 100, well within range
      match.submitAbility('p1', { abilityId: 'bolt', targetPosition: new Position(50, CLEAR_Y - 360) }); // aimed north, not east
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(85); // unaffected -- aimed away, not a range failure
    });

    it('CORRECTION (11_cross_2 Scope A): silently ignores a skillshot aimed away from the opponent even when they are colinear-behind the caster', () => {
      // REGRESSION: the aim-alignment check only ever measured perpendicular distance from the infinite
      // line through the caster along the aim direction -- with no forward-facing check, a click aimed
      // completely away from the opponent still registered as a hit whenever they happened to be behind
      // the caster along that same line. p2 here sits directly WEST of p1; p1 aims EAST (away from p2).
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      setPositions(match, new Position(300, CLEAR_Y), new Position(150, CLEAR_Y));
      match.submitAbility('p1', { abilityId: 'bolt', targetPosition: new Position(400, CLEAR_Y) }); // aim east; p2 is west
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(85); // unaffected -- behind the aim direction, not merely off to the side
    });

    it('silently ignores a skillshot whose line of sight to the opponent is blocked by an obstacle', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      // y=216 sits inside the left pillar's y-range [156,276]; x 200->400 crosses its x-range [246,306].
      setPositions(match, new Position(200, 216), new Position(400, 216));
      match.submitAbility('p1', { abilityId: 'bolt', targetPosition: new Position(400, 216) }); // aimed exactly at p2, in range
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(85); // unaffected -- blocked, despite perfect range and aim
    });

    it('silently ignores a skillshot with no targetPosition at all (DAMAGE/CROWD_CONTROL/POSITIONING all require aim)', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      setPositions(match, new Position(50, CLEAR_Y), new Position(150, CLEAR_Y));
      expect(() => match.submitAbility('p1', { abilityId: 'bolt' })).not.toThrow();
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(85);
    });

    it('silently ignores an unknown ability id', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      expect(() =>
        match.submitAbility('p1', { abilityId: 'nope', targetPosition: new Position(0, 0) }),
      ).not.toThrow();
    });

    it('self-heals when no target is given (HEAL is unaffected by the skillshot rework)', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      setPositions(match, new Position(50, CLEAR_Y), new Position(150, CLEAR_Y));
      match.submitAbility('p2', { abilityId: 'bolt', targetPosition: new Position(50, CLEAR_Y) }); // p1 takes 30 -> 55
      match.submitAbility('p1', { abilityId: 'heal' }); // no target -> self, no aiming needed
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.health).toBe(70); // 55 + 15
    });

    it('applies crowd control converting magnitude (seconds) to a duration window', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      setPositions(match, new Position(50, CLEAR_Y), new Position(150, CLEAR_Y)); // distance 100, root's range 400
      match.submitAbility('p1', { abilityId: 'root', targetPosition: new Position(150, CLEAR_Y) }); // aimed exactly at p2
      const before = match.snapshot().participants.find((p) => p.playerId === 'p2')!.position;
      match.submitMove('p2', { dx: 1, dy: 0 });
      match.tick(0.5);
      const after = match.snapshot().participants.find((p) => p.playerId === 'p2')!.position;
      expect(after).toEqual(before); // did not move -- crowd-controlled
    });

    describe('POSITIONING (CORRECTION, 11_cross_1: fixes a real pre-existing bug)', () => {
      // Previously, submitAbility resolved `target = req.targetPlayerId ? opponent : caster`, and the
      // client never sent targetPlayerId for POSITIONING abilities -- so `target` was always the caster,
      // and `caster.position = target.position` was a same-value no-op. Every POSITIONING ability in the
      // game (Bulwark Charge, Phase Step, Swift Reposition) consumed cooldown and resource and did
      // literally nothing. These tests are the regression coverage that gap never had.

      it('CRITICAL: actually moves the caster the full ability range in the aimed direction, when the path is clear', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(400, CLEAR_Y), new Position(150, CLEAR_Y));
        match.submitAbility('p1', { abilityId: 'blink', targetPosition: new Position(500, CLEAR_Y) }); // aim east
        const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
        expect(p1.position.x).toBeCloseTo(700, 5); // 400 + blink's 300 range, straight east
        expect(p1.position.y).toBeCloseTo(CLEAR_Y, 5);
      });

      it('wall-clamps the destination at an arena edge, same as regular movement', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(680, CLEAR_Y), new Position(150, CLEAR_Y));
        match.submitAbility('p1', { abilityId: 'blink', targetPosition: new Position(700, CLEAR_Y) }); // aim east
        const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
        expect(p1.position.x).toBe(ARENA_WIDTH); // 680 + 300 would overshoot; clamped at the wall
      });

      it('rejects the whole cast (caster does not move) when the path crosses an obstacle, but cooldown/resource are still consumed', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        // (200,216) -> aimed east for 300 range would land at (500,216), a straight line that crosses the
        // left pillar (x [246,306], y [156,276]) exactly like the DAMAGE line-of-sight test above.
        setPositions(match, new Position(200, 216), new Position(150, CLEAR_Y));
        match.submitAbility('p1', { abilityId: 'blink', targetPosition: new Position(250, 216) });
        const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
        expect(p1.position.x).toBe(200); // rejected outright -- stayed put
        expect(p1.position.y).toBe(216);
        expect(p1.resource).toBe(80); // blink's 20 cost still consumed on the whiffed cast
      });
    });

    it('throws InvalidMatchPhaseError before the match is ACTIVE', () => {
      const match = new MatchModel('m1', makePlayers());
      expect(() => match.submitAbility('p1', { abilityId: 'bolt' })).toThrow(InvalidMatchPhaseError);
    });

    describe('per-ability unique mechanics (11_cross_2 Scope E)', () => {
      it('E1: Shockwave Slam uses a wider aim-alignment radius than the shared default', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        // 60 units perpendicular off-axis: beyond SKILLSHOT_HIT_RADIUS (40) but within Shockwave Slam's
        // own SHOCKWAVE_SLAM_HIT_RADIUS (90). distance ~78, well within its 150 range.
        setPositions(match, new Position(300, CLEAR_Y), new Position(350, CLEAR_Y + 60));
        match.submitAbility('p1', { abilityId: 'shockwave-slam', targetPosition: new Position(400, CLEAR_Y) });
        const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
        expect(p2.crowdControlled).toBe(true);
      });

      it('E1: the same 60-unit-off-axis geometry misses under the shared default radius (proves the widening is real, not a no-op)', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(300, CLEAR_Y), new Position(350, CLEAR_Y + 60));
        match.submitAbility('p1', { abilityId: 'root', targetPosition: new Position(400, CLEAR_Y) }); // generic CROWD_CONTROL, default radius
        const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
        expect(p2.crowdControlled).toBe(false);
      });

      it('E2: Bulwark Charge staggers the opponent when its travel path passes close enough to them', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        // p1's charge travels (300,CLEAR_Y) -> (600,CLEAR_Y); p2 sits 20 units off that line, within the
        // stagger radius (SKILLSHOT_HIT_RADIUS, 40).
        setPositions(match, new Position(300, CLEAR_Y), new Position(450, CLEAR_Y + 20));
        match.submitAbility('p1', { abilityId: 'bulwark-charge', targetPosition: new Position(400, CLEAR_Y) });
        const state = match.snapshot();
        const p1 = state.participants.find((p) => p.playerId === 'p1')!;
        const p2 = state.participants.find((p) => p.playerId === 'p2')!;
        expect(p1.position.x).toBeCloseTo(600, 5); // still travels the full 300 range -- the stagger is additive
        expect(p2.crowdControlled).toBe(true);
      });

      it('E2: Bulwark Charge does not stagger an opponent far from its travel path', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(300, CLEAR_Y), new Position(450, CLEAR_Y + 200)); // far off the charge's line
        match.submitAbility('p1', { abilityId: 'bulwark-charge', targetPosition: new Position(400, CLEAR_Y) });
        const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
        expect(p2.crowdControlled).toBe(false);
      });

      it('E2: a different POSITIONING ability passing just as close to the opponent does not stagger them (only Bulwark Charge does)', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(300, CLEAR_Y), new Position(450, CLEAR_Y + 20));
        match.submitAbility('p1', { abilityId: 'blink', targetPosition: new Position(400, CLEAR_Y) }); // same geometry, generic POSITIONING ability
        const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
        expect(p2.crowdControlled).toBe(false);
      });

      it('E3: Phase Step ignores obstacles in its path, unlike other POSITIONING abilities', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        // Same geometry as the existing "rejects the whole cast... crosses an obstacle" test above
        // (blink, from (200,216) through the left pillar) -- Phase Step must succeed where blink didn't.
        setPositions(match, new Position(200, 216), new Position(150, CLEAR_Y));
        match.submitAbility('p1', { abilityId: 'phase-step', targetPosition: new Position(250, 216) });
        const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
        expect(p1.position.x).toBeCloseTo(500, 5); // 200 + phase-step's 300 range -- succeeded despite the obstacle
        expect(p1.position.y).toBeCloseTo(216, 5);
      });

      it('E4: Vital Siphon drains -- damages the opponent AND heals the caster on a hit', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(50, CLEAR_Y), new Position(120, CLEAR_Y)); // distance 70, vital-siphon's range 100
        match.submitAbility('p2', { abilityId: 'bolt', targetPosition: new Position(50, CLEAR_Y) }); // p1: 85 -> 55, so the heal is visible
        match.submitAbility('p1', { abilityId: 'vital-siphon', targetPosition: new Position(120, CLEAR_Y) }); // aimed exactly at p2
        const state = match.snapshot();
        const p1 = state.participants.find((p) => p.playerId === 'p1')!;
        const p2 = state.participants.find((p) => p.playerId === 'p2')!;
        expect(p2.health).toBe(67); // 85 - 18 (vital-siphon's magnitude)
        expect(p1.health).toBe(73); // 55 + 18
      });

      it('E4: Vital Siphon whiffs when out of range -- no damage, no heal, cost still consumed', () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(50, CLEAR_Y), new Position(300, CLEAR_Y)); // distance 250 > vital-siphon's 100 range
        match.submitAbility('p1', { abilityId: 'vital-siphon', targetPosition: new Position(300, CLEAR_Y) });
        const state = match.snapshot();
        const p1 = state.participants.find((p) => p.playerId === 'p1')!;
        const p2 = state.participants.find((p) => p.playerId === 'p2')!;
        expect(p2.health).toBe(85); // unaffected
        expect(p1.health).toBe(85); // no self-heal either -- a real whiff, not a partial success
        expect(p1.resource).toBe(75); // 100 - vital-siphon's 25 cost, still consumed
      });

      it("E4 CRITICAL: Vital Siphon no longer casts as a no-aim instant self-heal -- the old HEAL-branch behavior is genuinely gone for it", () => {
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(50, CLEAR_Y), new Position(120, CLEAR_Y));
        expect(() => match.submitAbility('p1', { abilityId: 'vital-siphon' })).not.toThrow();
        const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
        expect(p1.health).toBe(85); // no-op: no targetPosition means no direction to cast in, not a self-heal fallback
      });

      it('E4: Iron Skin-equivalent (the fixture\'s range-0 "heal") is unaffected -- still instant/self-targeted/no-aim', () => {
        // Regression coverage for the range===0 branch specifically, now that HEAL resolution branches on
        // ability.range -- already exercised by the "self-heals when no target is given" test above, but
        // asserted here explicitly as part of this prompt's own Scope E4 checklist.
        const match = new MatchModel('m1', makePlayers());
        selectBothChampions(match);
        setPositions(match, new Position(50, CLEAR_Y), new Position(150, CLEAR_Y));
        match.submitAbility('p2', { abilityId: 'bolt', targetPosition: new Position(50, CLEAR_Y) }); // p1: 85 -> 55
        match.submitAbility('p1', { abilityId: 'heal' }); // no target -- still self-targeted, instant
        const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
        expect(p1.health).toBe(70); // 55 + 15
      });
    });
  });

  describe('checkWinConditions / tick — elimination and time limit', () => {
    it('ends the match by ELIMINATION crediting the surviving team, broadcasting match:end', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      const p2 = (match as unknown as { participants: { health: number }[] }).participants[1];
      p2.health = 0;
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.endReason).toBe(EndReason.ELIMINATION);
      expect(match.winningTeam).toBe(Team.A);
      expect(events.some((e) => e.type === 'match:end')).toBe(true);
    });

    it('ends by TIME_LIMIT crediting higher health, or a draw if equal', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      (match as unknown as { startedAt: number }).startedAt = Date.now() - 5 * 60_000 - 1;
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.endReason).toBe(EndReason.TIME_LIMIT);
      expect(match.winningTeam).toBeNull();
      expect(events.some((e) => e.type === 'match:end')).toBe(true);
    });
  });

  describe('disconnect / reconnect', () => {
    it('marks disconnected and broadcasts player_disconnected', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      match.disconnect('p1');
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.connectionStatus).toBe(ConnectionStatus.DISCONNECTED);
      expect(events.some((e) => e.type === 'player_disconnected')).toBe(true);
    });

    it('is a no-op for an already-disconnected participant', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.disconnect('p1');
      expect(() => match.disconnect('p1')).not.toThrow();
    });

    it('restores CONNECTED within the grace period and broadcasts player_reconnected', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      match.disconnect('p1');
      match.reconnect('p1');
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.connectionStatus).toBe(ConnectionStatus.CONNECTED);
      expect(events.some((e) => e.type === 'player_reconnected')).toBe(true);
    });

    it('throws GracePeriodExpiredError once 30s have elapsed', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.disconnect('p1');
      const p1 = (match as unknown as { participants: { disconnectedAt: number | null }[] }).participants[0];
      p1.disconnectedAt = Date.now() - 30_001;
      expect(() => match.reconnect('p1')).toThrow(GracePeriodExpiredError);
    });

    it('tick() ends the match as DISCONNECT_FORFEIT once the grace period elapses without reconnect', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const events = collectEvents(match);
      match.disconnect('p1');
      const p1 = (match as unknown as { participants: { disconnectedAt: number | null }[] }).participants[0];
      p1.disconnectedAt = Date.now() - 30_001;
      match.tick(0.05);
      expect(match.phase).toBe(MatchPhase.ENDED);
      expect(match.endReason).toBe(EndReason.DISCONNECT_FORFEIT);
      expect(match.winningTeam).toBe(Team.B);
      expect(events.some((e) => e.type === 'match:end')).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('includes both participants and an incrementing tick count', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      const before = match.snapshot().tick;
      match.tick(0.05);
      const after = match.snapshot().tick;
      expect(after).toBe(before + 1);
      expect(match.snapshot().participants).toHaveLength(2);
    });
  });
});
