import { ChampionSelectController } from './ChampionSelectController';
import { ClientMatchModel } from '../model/ClientMatchModel';
import type { ChampionSelectView } from '../view/ChampionSelectView';
import type { SocketConnectionController } from './SocketConnectionController';

function makeSocketController(): SocketConnectionController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as SocketConnectionController & { operation: jest.Mock };
}

function makeView(): ChampionSelectView {
  return {} as unknown as ChampionSelectView;
}

describe('ChampionSelectController', () => {
  describe('selectChampion', () => {
    it('forwards champion:select with the chosen championId', () => {
      const socketController = makeSocketController();
      const controller = new ChampionSelectController(new ClientMatchModel(), makeView(), socketController);

      controller.operation('selectChampion', { championId: 'vex' });

      expect(socketController.operation).toHaveBeenCalledWith('champion:select', { championId: 'vex' });
    });

    it('does not mutate the model itself — only the server-driven champion:selected event does that', () => {
      const model = new ClientMatchModel();
      const controller = new ChampionSelectController(model, makeView(), makeSocketController());

      controller.operation('selectChampion', { championId: 'korr' });

      expect(model.championSelection).toBeNull();
    });

    it('does nothing when payload is omitted', () => {
      const socketController = makeSocketController();
      const controller = new ChampionSelectController(new ClientMatchModel(), makeView(), socketController);

      controller.operation('selectChampion');

      expect(socketController.operation).not.toHaveBeenCalled();
    });
  });

  describe('unrecognized action', () => {
    it('does nothing and does not throw', () => {
      const socketController = makeSocketController();
      const controller = new ChampionSelectController(new ClientMatchModel(), makeView(), socketController);

      expect(() => controller.operation('nonsense', { championId: 'rin' })).not.toThrow();
      expect(socketController.operation).not.toHaveBeenCalled();
    });
  });
});
