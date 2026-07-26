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
  InvalidMatchPhaseError,
  SelectionWindowExpiredError,
  InvalidChampionSelectionError,
} from '@arena/shared';
import { MatchModel } from './MatchModel';

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
});
