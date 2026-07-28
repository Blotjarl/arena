import { InvalidUsernameError } from '@arena/shared';
import { LobbyController } from './LobbyController';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import type { LobbyView } from '../view/LobbyView';
import type { SocketConnectionController } from './SocketConnectionController';

function makeSocketController(): SocketConnectionController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as SocketConnectionController & { operation: jest.Mock };
}

function makeView(): LobbyView {
  return {} as unknown as LobbyView;
}

describe('LobbyController', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('submitUsername', () => {
    it('stores the username on the model and forwards identify with a generated playerId', () => {
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);

      controller.operation('submitUsername', { username: 'Raj' });

      expect(model.username).toBe('Raj');
      expect(model.playerId).not.toBeNull();
      expect(socketController.operation).toHaveBeenCalledWith('identify', {
        playerId: model.playerId,
        username: 'Raj',
      });
    });

    it('reuses a playerId already restored from sessionStorage rather than generating a new one', () => {
      sessionStorage.setItem('arena:playerId', 'player-99');
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);

      controller.operation('submitUsername', { username: 'Raj' });

      expect(model.playerId).toBe('player-99');
      expect(socketController.operation).toHaveBeenCalledWith('identify', {
        playerId: 'player-99',
        username: 'Raj',
      });
    });

    it('throws InvalidUsernameError and does not forward when the username is empty', () => {
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);

      expect(() => controller.operation('submitUsername', { username: '' })).toThrow(InvalidUsernameError);
      expect(socketController.operation).not.toHaveBeenCalled();
    });

    it('throws InvalidUsernameError and does not forward when the username exceeds 24 characters', () => {
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);
      const tooLong = 'a'.repeat(25);

      expect(() => controller.operation('submitUsername', { username: tooLong })).toThrow(InvalidUsernameError);
      expect(socketController.operation).not.toHaveBeenCalled();
    });

    it('throws InvalidUsernameError when payload is omitted entirely', () => {
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), makeSocketController());
      expect(() => controller.operation('submitUsername')).toThrow(InvalidUsernameError);
    });

    it('does not persist to sessionStorage when it is unavailable (non-browser environment guard)', () => {
      const original = (globalThis as { sessionStorage?: Storage }).sessionStorage;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).sessionStorage;
      try {
        const model = new ClientIdentityModel();
        const socketController = makeSocketController();
        const controller = new LobbyController(model, makeView(), socketController);

        expect(() => controller.operation('submitUsername', { username: 'Raj' })).not.toThrow();
        expect(model.playerId).not.toBeNull();
      } finally {
        (globalThis as { sessionStorage?: Storage }).sessionStorage = original;
      }
    });

    it('uses crypto.randomUUID() directly when the runtime provides it', () => {
      const original = crypto.randomUUID;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (crypto as any).randomUUID = () => 'fixed-uuid';
      try {
        const model = new ClientIdentityModel();
        const socketController = makeSocketController();
        const controller = new LobbyController(model, makeView(), socketController);

        controller.operation('submitUsername', { username: 'Raj' });

        expect(model.playerId).toBe('fixed-uuid');
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (crypto as any).randomUUID = original;
      }
    });

    it('accepts a username at exactly the 24-character boundary', () => {
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);
      const exactly24 = 'a'.repeat(24);

      expect(() => controller.operation('submitUsername', { username: exactly24 })).not.toThrow();
      expect(socketController.operation).toHaveBeenCalledWith('identify', expect.objectContaining({ username: exactly24 }));
    });
  });

  describe('joinQueue / returnToQueue', () => {
    it('joinQueue emits queue:join with no payload', () => {
      const socketController = makeSocketController();
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), socketController);

      controller.operation('joinQueue');

      expect(socketController.operation).toHaveBeenCalledWith('queue:join');
    });

    it('returnToQueue also emits queue:join with no payload (ResultsScreen gap-fill, docs/01_class_list.md §6c)', () => {
      const socketController = makeSocketController();
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), socketController);

      controller.operation('returnToQueue');

      expect(socketController.operation).toHaveBeenCalledWith('queue:join');
    });
  });

  describe('cancelQueue', () => {
    it('emits queue:cancel with no payload', () => {
      const socketController = makeSocketController();
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), socketController);

      controller.operation('cancelQueue');

      expect(socketController.operation).toHaveBeenCalledWith('queue:cancel');
    });
  });

  describe('unrecognized action', () => {
    it('does nothing and does not throw', () => {
      const socketController = makeSocketController();
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), socketController);

      expect(() => controller.operation('nonsense')).not.toThrow();
      expect(socketController.operation).not.toHaveBeenCalled();
    });
  });
});
