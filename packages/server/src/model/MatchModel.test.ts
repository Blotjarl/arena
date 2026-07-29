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
const SPAWN_P2_X = 550; // must match MatchModel's ARENA_WIDTH - SPAWN_WALL_MARGIN (CORRECTION 11_server_3: ARENA_WIDTH is now 600)

const VEX = new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 10, 200, [
  new Ability('bolt', 'Arcane Bolt', 5, 20, 500, EffectType.DAMAGE, 30),
  new Ability('heal', 'Self Mend', 8, 30, 0, EffectType.HEAL, 15),
  new Ability('root', 'Frost Lance', 6, 25, 400, EffectType.CROWD_CONTROL, 1.5),
  new Ability('blink', 'Phase Step', 10, 20, 300, EffectType.POSITIONING, 0),
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

  describe('submitAbility', () => {
    it('applies damage to an in-range target and consumes cooldown/resource on the caster', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitAbility('p1', { abilityId: 'bolt', targetPlayerId: 'p2' });
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(55); // 85 - 30
    });

    it('silently ignores an out-of-range target (no effect, no throw)', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      // CORRECTION (Step 11): movement is now clamped to the arena, so pushing p2 via submitMove/tick can
      // no longer reliably exceed bolt's 500-range within a 400x400 arena. Set the target's position
      // directly instead, to keep this test about range-checking, not the wall clamp (covered separately
      // in ParticipantState.test.ts).
      const p2State = (match as unknown as { participants: { playerId: string; position: Position }[] }).participants.find(
        (p) => p.playerId === 'p2',
      )!;
      p2State.position = new Position(p2State.position.x + 1000, p2State.position.y);
      expect(() => match.submitAbility('p1', { abilityId: 'bolt', targetPlayerId: 'p2' })).not.toThrow();
      const p2 = match.snapshot().participants.find((p) => p.playerId === 'p2')!;
      expect(p2.health).toBe(85);
    });

    it('silently ignores an unknown ability id', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      expect(() => match.submitAbility('p1', { abilityId: 'nope', targetPlayerId: 'p2' })).not.toThrow();
    });

    it('self-heals when no target is given', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      match.submitAbility('p2', { abilityId: 'bolt', targetPlayerId: 'p1' }); // p1 takes 30 -> 55
      match.submitAbility('p1', { abilityId: 'heal' }); // no target -> self
      const p1 = match.snapshot().participants.find((p) => p.playerId === 'p1')!;
      expect(p1.health).toBe(70); // 55 + 15
    });

    it('applies crowd control converting magnitude (seconds) to a duration window', () => {
      const match = new MatchModel('m1', makePlayers());
      selectBothChampions(match);
      // CORRECTION (Step 11, 11_server_3): the widened 600-wide arena puts the two spawns 500 apart, which
      // now exceeds 'root' (Frost Lance)'s 400 range -- pull p2 within range directly, the same way the
      // out-of-range test above manipulates position directly to keep this test about CC application, not
      // spawn-distance geometry.
      const p1State = (match as unknown as { participants: { playerId: string; position: Position }[] }).participants.find(
        (p) => p.playerId === 'p1',
      )!;
      const p2State = (match as unknown as { participants: { playerId: string; position: Position }[] }).participants.find(
        (p) => p.playerId === 'p2',
      )!;
      p2State.position = new Position(p1State.position.x + 100, p1State.position.y);
      match.submitAbility('p1', { abilityId: 'root', targetPlayerId: 'p2' });
      const before = match.snapshot().participants.find((p) => p.playerId === 'p2')!.position;
      match.submitMove('p2', { dx: 1, dy: 0 });
      match.tick(0.5);
      const after = match.snapshot().participants.find((p) => p.playerId === 'p2')!.position;
      expect(after).toEqual(before); // did not move -- crowd-controlled
    });

    it('throws InvalidMatchPhaseError before the match is ACTIVE', () => {
      const match = new MatchModel('m1', makePlayers());
      expect(() => match.submitAbility('p1', { abilityId: 'bolt' })).toThrow(InvalidMatchPhaseError);
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
