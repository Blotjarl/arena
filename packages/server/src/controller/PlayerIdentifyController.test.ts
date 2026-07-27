import { InvalidUsernameError } from '@arena/shared';
import { PlayerIdentifyController } from './PlayerIdentifyController';

function makeController(): PlayerIdentifyController {
  const noopModel = { notifyChanged: () => {} };
  const noopView = { getModel: () => noopModel, setModel: () => {}, getController: () => null, setController: () => {} };
  return new PlayerIdentifyController(noopModel as never, noopView as never);
}

describe('PlayerIdentifyController', () => {
  describe('operation', () => {
    it('accepts a 1-24 character username without throwing', () => {
      const controller = makeController();
      expect(() => controller.operation('identify', { playerId: 'p1', username: 'Alice' })).not.toThrow();
      expect(() => controller.operation('identify', { playerId: 'p1', username: 'A'.repeat(24) })).not.toThrow();
      expect(() => controller.operation('identify', { playerId: 'p1', username: 'A' })).not.toThrow();
    });

    it('throws InvalidUsernameError for an empty username', () => {
      const controller = makeController();
      expect(() => controller.operation('identify', { playerId: 'p1', username: '' })).toThrow(InvalidUsernameError);
    });

    it('throws InvalidUsernameError for a username over 24 characters', () => {
      const controller = makeController();
      expect(() => controller.operation('identify', { playerId: 'p1', username: 'A'.repeat(25) })).toThrow(
        InvalidUsernameError,
      );
    });

    it('throws InvalidUsernameError when payload is missing entirely', () => {
      const controller = makeController();
      expect(() => controller.operation('identify')).toThrow(InvalidUsernameError);
    });
  });
});
