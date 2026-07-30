import { ClientMatchModel } from '../ClientMatchModel';
import {
  MatchPhase, Team, ConnectionStatus, EndReason,
  ChampionSelectedPayload, MatchStartPayload, MatchStatePayload, MatchEndPayload,
  ParticipantSnapshot,
} from '@arena/shared';
import { Position } from '@arena/shared';

const makeParticipant = (playerId: string): ParticipantSnapshot => ({
  playerId,
  team: Team.A,
  championId: 'korr',
  position: new Position(0, 0),
  health: 180,
  resource: 100,
  cooldownsRemaining: {},
  crowdControlled: false,
  connectionStatus: ConnectionStatus.CONNECTED,
  alive: true,
});

const makeState = (matchId = 'match-1', tick = 1): MatchStatePayload => ({
  matchId,
  tick,
  participants: [makeParticipant('p1'), makeParticipant('p2')],
});

describe('ClientMatchModel', () => {
  it('starts with all fields null', () => {
    const m = new ClientMatchModel();
    expect(m.matchId).toBeNull();
    expect(m.phase).toBeNull();
    expect(m.latestState).toBeNull();
    expect(m.result).toBeNull();
  });

  it('phase stays null until applyMatchStart is called', () => {
    const m = new ClientMatchModel();
    const selection: ChampionSelectedPayload = {
      matchId: 'match-1', playerId: 'p1', championId: 'korr', bothSelected: false,
    };
    m.applyChampionSelected(selection);
    expect(m.phase).toBeNull();
  });

  describe('applyChampionSelected()', () => {
    it('stores the champion selection payload exactly as given — same reference, no alteration', () => {
      const m = new ClientMatchModel();
      const payload: ChampionSelectedPayload = {
        matchId: 'match-1', playerId: 'p1', championId: 'vex', bothSelected: true,
      };
      m.applyChampionSelected(payload);
      expect(m.championSelection).toBe(payload);
    });
  });

  describe('applyMatchStart()', () => {
    it('stores matchId from the server payload as-is — no alteration', () => {
      const m = new ClientMatchModel();
      m.applyMatchStart({ matchId: 'match-99', initialState: makeState('match-99') });
      expect(m.matchId).toBe('match-99');
    });

    it('sets phase to ACTIVE', () => {
      const m = new ClientMatchModel();
      m.applyMatchStart({ matchId: 'match-1', initialState: makeState() });
      expect(m.phase).toBe(MatchPhase.ACTIVE);
    });

    it('stores the initial state exactly as given — same reference, no alteration', () => {
      const m = new ClientMatchModel();
      const state = makeState();
      m.applyMatchStart({ matchId: 'match-1', initialState: state });
      expect(m.latestState).toBe(state);
    });
  });

  describe('applyMatchState()', () => {
    it('replaces latestState with the server payload exactly — no field merging or alteration', () => {
      const m = new ClientMatchModel();
      const first = makeState('match-1', 1);
      const second = makeState('match-1', 2);
      m.applyMatchStart({ matchId: 'match-1', initialState: first });
      m.applyMatchState(second);
      expect(m.latestState).toBe(second);
      expect(m.latestState!.participants).toBe(second.participants); // same reference
    });
  });

  describe('applyMatchEnd()', () => {
    it('stores the match-end payload exactly as given — same reference, no alteration', () => {
      const m = new ClientMatchModel();
      const payload: MatchEndPayload = {
        matchId: 'match-1', reason: EndReason.ELIMINATION,
        winningTeam: Team.A, durationMs: 42000,
      };
      m.applyMatchEnd(payload);
      expect(m.result).toBe(payload);
    });
  });

  describe('reset()', () => {
    // REGRESSION: a returning player's second match reused this same ClientMatchModel instance with
    // no way to clear the first match's leftover state. `result` staying non-null permanently stuck
    // AppRouter on ResultsScreen (it checks `matchModel.result !== null` before anything else), and
    // `championSelection` staying non-null pre-disabled every "Select {champion}" button on the new
    // match's Champion Select screen (`disabled={mySelection !== null}`) — both silently blocked ever
    // getting into a second game. See SocketConnectionController's match:found handler, which now
    // calls this before ClientQueueModel.setMatched() for the new match.
    it('clears every match-specific field back to its initial null value', () => {
      const m = new ClientMatchModel();
      m.applyChampionSelected({ matchId: 'match-1', playerId: 'p1', championId: 'korr', bothSelected: true });
      m.applyMatchStart({ matchId: 'match-1', initialState: makeState() });
      m.applyMatchState(makeState('match-1', 2));
      m.applyMatchEnd({ matchId: 'match-1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 5000 });

      m.reset();

      expect(m.matchId).toBeNull();
      expect(m.phase).toBeNull();
      expect(m.latestState).toBeNull();
      expect(m.result).toBeNull();
      expect(m.championSelection).toBeNull();
    });

    it('notifies listeners so views depending on this model re-render', () => {
      const m = new ClientMatchModel();
      const listener = { modelChanged: jest.fn() };
      m.addModelListener(listener);

      m.reset();

      expect(listener.modelChanged).toHaveBeenCalled();
    });
  });
});
