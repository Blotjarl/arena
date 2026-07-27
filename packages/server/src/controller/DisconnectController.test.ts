import { GracePeriodExpiredError, SOCKET_EVENTS } from '@arena/shared';
import { DisconnectController } from './DisconnectController';
import type { MatchModel } from '../model/MatchModel';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';

function makeMatch(overrides: Partial<MatchModel> = {}): MatchModel {
  return { id: 'm1', disconnect: jest.fn(), reconnect: jest.fn(), ...overrides } as unknown as MatchModel;
}

const view = {} as MatchBroadcastView;

describe('DisconnectController', () => {
  describe('operation', () => {
    it("forwards 'disconnect' to MatchModel.disconnect", () => {
      const match = makeMatch();
      const controller = new DisconnectController(match, view);
      controller.operation('disconnect', { playerId: 'p1' });
      expect(match.disconnect).toHaveBeenCalledWith('p1');
    });

    it('forwards match:reconnect to MatchModel.reconnect', () => {
      const match = makeMatch();
      const controller = new DisconnectController(match, view);
      controller.operation(SOCKET_EVENTS.MATCH_RECONNECT, { playerId: 'p1' });
      expect(match.reconnect).toHaveBeenCalledWith('p1');
    });

    it('lets GracePeriodExpiredError propagate uncaught on a late reconnect (R6.3, R6.4)', () => {
      const match = makeMatch({
        reconnect: jest.fn(() => {
          throw new GracePeriodExpiredError('p1', 'm1');
        }),
      });
      const controller = new DisconnectController(match, view);
      expect(() => controller.operation(SOCKET_EVENTS.MATCH_RECONNECT, { playerId: 'p1' })).toThrow(
        GracePeriodExpiredError,
      );
    });

    it('is a no-op when payload is missing', () => {
      const match = makeMatch();
      const controller = new DisconnectController(match, view);
      expect(() => controller.operation('disconnect')).not.toThrow();
      expect(match.disconnect).not.toHaveBeenCalled();
    });
  });
});
