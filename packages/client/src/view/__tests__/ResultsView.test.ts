import { ModelEvent, EndReason } from '@arena/shared';
import { ResultsView } from '../ResultsView';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { LobbyController } from '../../controller/LobbyController';

function makeController(): LobbyController {
  return { operation: jest.fn() } as unknown as LobbyController;
}

describe('ResultsView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the match model', () => {
      const match = new ClientMatchModel();
      const addSpy = jest.spyOn(match, 'addModelListener');

      const view = new ResultsView(match, new ClientQueueModel(), makeController());

      expect(addSpy).toHaveBeenCalledWith(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the observed match model', () => {
      const match = new ClientMatchModel();
      const view = new ResultsView(match, new ClientQueueModel(), makeController());
      expect(view.getModel()).toBe(match);

      const other = new ClientMatchModel();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('getQueueModel / setQueueModel', () => {
    it('returns and replaces the observed queue model', () => {
      const queue = new ClientQueueModel();
      const view = new ResultsView(new ClientMatchModel(), queue, makeController());
      expect(view.getQueueModel()).toBe(queue);

      const other = new ClientQueueModel();
      view.setQueueModel(other);
      expect(view.getQueueModel()).toBe(other);
    });
  });

  describe('getController / setController', () => {
    it('returns and replaces the controller', () => {
      const controller = makeController();
      const view = new ResultsView(new ClientMatchModel(), new ClientQueueModel(), controller);
      expect(view.getController()).toBe(controller);

      const other = makeController();
      view.setController(other);
      expect(view.getController()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it('invokes the bound update callback', () => {
      const match = new ClientMatchModel();
      const view = new ResultsView(match, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      view.modelChanged(new ModelEvent(match, 'matchEnd', {}));

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('CRITICAL CHECKPOINT: firing match.applyMatchEnd() actually reaches the bound callback end-to-end', () => {
      const match = new ClientMatchModel();
      const view = new ResultsView(match, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      match.applyMatchEnd({ matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: null, durationMs: 1000 });

      expect(callback).toHaveBeenCalled();
    });
  });
});
