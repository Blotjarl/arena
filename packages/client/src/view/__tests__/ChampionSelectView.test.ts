import { ModelEvent } from '@arena/shared';
import { ChampionSelectView } from '../ChampionSelectView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { ChampionSelectController } from '../../controller/ChampionSelectController';

function makeController(): ChampionSelectController {
  return { operation: jest.fn() } as unknown as ChampionSelectController;
}

describe('ChampionSelectView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the identity, match, and queue models', () => {
      const identity = new ClientIdentityModel();
      const match = new ClientMatchModel();
      const queue = new ClientQueueModel();
      const identitySpy = jest.spyOn(identity, 'addModelListener');
      const matchSpy = jest.spyOn(match, 'addModelListener');
      const queueSpy = jest.spyOn(queue, 'addModelListener');

      const view = new ChampionSelectView(identity, match, queue, makeController());

      expect(identitySpy).toHaveBeenCalledWith(view);
      expect(matchSpy).toHaveBeenCalledWith(view);
      expect(queueSpy).toHaveBeenCalledWith(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the observed match model', () => {
      const match = new ClientMatchModel();
      const view = new ChampionSelectView(new ClientIdentityModel(), match, new ClientQueueModel(), makeController());
      expect(view.getModel()).toBe(match);

      const other = new ClientMatchModel();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('getIdentityModel / setIdentityModel', () => {
    it('returns and replaces the observed identity model', () => {
      const identity = new ClientIdentityModel();
      const view = new ChampionSelectView(identity, new ClientMatchModel(), new ClientQueueModel(), makeController());
      expect(view.getIdentityModel()).toBe(identity);

      const other = new ClientIdentityModel();
      view.setIdentityModel(other);
      expect(view.getIdentityModel()).toBe(other);
    });
  });

  describe('getQueueModel / setQueueModel', () => {
    it('returns and replaces the observed queue model', () => {
      const queue = new ClientQueueModel();
      const view = new ChampionSelectView(new ClientIdentityModel(), new ClientMatchModel(), queue, makeController());
      expect(view.getQueueModel()).toBe(queue);

      const other = new ClientQueueModel();
      view.setQueueModel(other);
      expect(view.getQueueModel()).toBe(other);
    });
  });

  describe('getController / setController', () => {
    it('returns and replaces the controller', () => {
      const controller = makeController();
      const view = new ChampionSelectView(
        new ClientIdentityModel(),
        new ClientMatchModel(),
        new ClientQueueModel(),
        controller,
      );
      expect(view.getController()).toBe(controller);

      const other = makeController();
      view.setController(other);
      expect(view.getController()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it('invokes the bound update callback', () => {
      const match = new ClientMatchModel();
      const view = new ChampionSelectView(new ClientIdentityModel(), match, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      view.modelChanged(new ModelEvent(match, 'championSelection:changed', {}));

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CRITICAL CHECKPOINT: firing match.applyChampionSelected() actually reaches the bound callback end-to-end', () => {
      const match = new ClientMatchModel();
      const view = new ChampionSelectView(new ClientIdentityModel(), match, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      match.applyChampionSelected({ matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: false });

      expect(callback).toHaveBeenCalled();
    });
  });
});
