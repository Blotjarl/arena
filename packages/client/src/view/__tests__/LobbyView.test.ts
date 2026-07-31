import type { Socket } from 'socket.io-client';
import { ModelEvent } from '@arena/shared';
import { LobbyView } from '../LobbyView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { LobbyController } from '../../controller/LobbyController';

function makeController(): LobbyController {
  return { operation: jest.fn() } as unknown as LobbyController;
}

describe('LobbyView', () => {
  describe('construction', () => {
    it('registers itself as a listener on both the identity model and the queue model', () => {
      const identity = new ClientIdentityModel();
      const queue = new ClientQueueModel();
      const addIdentitySpy = jest.spyOn(identity, 'addModelListener');
      const addQueueSpy = jest.spyOn(queue, 'addModelListener');

      const view = new LobbyView(identity, queue, makeController());

      expect(addIdentitySpy).toHaveBeenCalledWith(view);
      expect(addQueueSpy).toHaveBeenCalledWith(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the observed identity model', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      expect(view.getModel()).toBe(identity);

      const other = new ClientIdentityModel();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('getQueueModel / setQueueModel', () => {
    it('returns and replaces the observed queue model', () => {
      const queue = new ClientQueueModel();
      const view = new LobbyView(new ClientIdentityModel(), queue, makeController());
      expect(view.getQueueModel()).toBe(queue);

      const other = new ClientQueueModel();
      view.setQueueModel(other);
      expect(view.getQueueModel()).toBe(other);
    });
  });

  describe('getController / setController', () => {
    it('returns and replaces the controller', () => {
      const controller = makeController();
      const view = new LobbyView(new ClientIdentityModel(), new ClientQueueModel(), controller);
      expect(view.getController()).toBe(controller);

      const other = makeController();
      view.setController(other);
      expect(view.getController()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it('invokes the bound update callback', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      view.modelChanged(new ModelEvent(identity, 'identity:changed', {}));

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does nothing (does not throw) when no callback has been bound yet', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      expect(() => view.modelChanged(new ModelEvent(identity, 'identity:changed', {}))).not.toThrow();
    });

    it('CRITICAL CHECKPOINT: firing identity.identify() actually reaches the bound callback end-to-end', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      identity.identify('Raj');

      expect(callback).toHaveBeenCalled();
    });

    it('CRITICAL CHECKPOINT: firing queue.setQueued() actually reaches the bound callback end-to-end', () => {
      const queue = new ClientQueueModel();
      const view = new LobbyView(new ClientIdentityModel(), queue, makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      queue.setQueued(2);

      expect(callback).toHaveBeenCalled();
    });

    it('clears a previously-set queueError on any model change', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      view.modelChanged(new ModelEvent(identity, 'identity:changed', {})); // no-op, just exercising the path
      // Simulate a prior server-rejected queue action having set queueError (see the socket test below for
      // how it's actually populated), then a later model change clearing it.
      (view as unknown as { queueError: unknown }).queueError = { code: 'ALREADY_QUEUED', message: 'boom' };

      view.modelChanged(new ModelEvent(identity, 'identity:changed', {}));

      expect(view.getQueueError()).toBeNull();
    });
  });

  describe('getQueueError / socket wiring', () => {
    function makeFakeSocket(): { on: jest.Mock; handlers: Map<string, (payload: unknown) => void> } {
      const handlers = new Map<string, (payload: unknown) => void>();
      const on = jest.fn((event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, handler);
      });
      return { on, handlers };
    }

    it('is null before any error event arrives', () => {
      const view = new LobbyView(new ClientIdentityModel(), new ClientQueueModel(), makeController());
      expect(view.getQueueError()).toBeNull();
    });

    it('does not throw when constructed without a socket (most existing call sites)', () => {
      expect(
        () => new LobbyView(new ClientIdentityModel(), new ClientQueueModel(), makeController()),
      ).not.toThrow();
    });

    it('CRITICAL CHECKPOINT: a server-emitted error event (e.g. AlreadyQueuedError on a rebound reconnect) is captured and triggers a re-render', () => {
      const socket = makeFakeSocket();
      const view = new LobbyView(
        new ClientIdentityModel(),
        new ClientQueueModel(),
        makeController(),
        socket as unknown as Socket,
      );
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      socket.handlers.get('error')!({ code: 'ALREADY_QUEUED', message: 'Already in an active match.' });

      expect(view.getQueueError()).toEqual({ code: 'ALREADY_QUEUED', message: 'Already in an active match.' });
      expect(callback).toHaveBeenCalled();
    });
  });
});
