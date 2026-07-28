import { ModelEvent, Team, ConnectionStatus, ParticipantSnapshot, Position } from '@arena/shared';
import { MatchHUDView } from '../MatchHUDView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import type { MatchController } from '../../controller/MatchController';

function makeController(): MatchController {
  return { operation: jest.fn() } as unknown as MatchController;
}

function makeParticipant(playerId: string): ParticipantSnapshot {
  return {
    playerId,
    team: Team.A,
    championId: 'vex',
    position: new Position(1, 2),
    health: 85,
    resource: 100,
    cooldownsRemaining: {},
    crowdControlled: false,
    connectionStatus: ConnectionStatus.CONNECTED,
    alive: true,
  };
}

describe('MatchHUDView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the match model only (identity is read-only reference data)', () => {
      const match = new ClientMatchModel();
      const addSpy = jest.spyOn(match, 'addModelListener');

      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());

      expect(addSpy).toHaveBeenCalledWith(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the observed match model', () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      expect(view.getModel()).toBe(match);

      const other = new ClientMatchModel();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('getIdentityModel / setIdentityModel', () => {
    it('returns and replaces the observed identity model', () => {
      const identity = new ClientIdentityModel();
      const view = new MatchHUDView(identity, new ClientMatchModel(), makeController());
      expect(view.getIdentityModel()).toBe(identity);

      const other = new ClientIdentityModel();
      view.setIdentityModel(other);
      expect(view.getIdentityModel()).toBe(other);
    });
  });

  describe('getController / setController', () => {
    it('returns and replaces the controller', () => {
      const controller = makeController();
      const view = new MatchHUDView(new ClientIdentityModel(), new ClientMatchModel(), controller);
      expect(view.getController()).toBe(controller);

      const other = makeController();
      view.setController(other);
      expect(view.getController()).toBe(other);
    });
  });

  describe('getInterpolationBuffer', () => {
    it('returns the same buffer instance across calls', () => {
      const view = new MatchHUDView(new ClientIdentityModel(), new ClientMatchModel(), makeController());
      expect(view.getInterpolationBuffer()).toBe(view.getInterpolationBuffer());
    });
  });

  describe('modelChanged', () => {
    it('invokes the bound update callback for any event', () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      view.modelChanged(new ModelEvent(match, 'championSelection:changed', {}));

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("CRITICAL CHECKPOINT: a 'matchState' event pushes the snapshot into the interpolation buffer", () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      const pushSpy = jest.spyOn(view.getInterpolationBuffer(), 'push');
      const state = { matchId: 'm1', tick: 1, participants: [makeParticipant('p1'), makeParticipant('p2')] as [ParticipantSnapshot, ParticipantSnapshot] };

      view.modelChanged(new ModelEvent(match, 'matchState', state));

      expect(pushSpy).toHaveBeenCalledWith(state);
    });

    it("does not push into the interpolation buffer for a non-'matchState' event", () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      const pushSpy = jest.spyOn(view.getInterpolationBuffer(), 'push');

      view.modelChanged(new ModelEvent(match, 'matchStart', {}));

      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('CRITICAL CHECKPOINT: firing match.applyMatchState() actually reaches the bound callback end-to-end and feeds the interpolation buffer', () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);
      const pushSpy = jest.spyOn(view.getInterpolationBuffer(), 'push');
      const state = { matchId: 'm1', tick: 1, participants: [makeParticipant('p1'), makeParticipant('p2')] as [ParticipantSnapshot, ParticipantSnapshot] };

      match.applyMatchState(state);

      expect(callback).toHaveBeenCalled();
      expect(pushSpy).toHaveBeenCalledWith(state);
    });
  });
});
