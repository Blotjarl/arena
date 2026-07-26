import { Player, ModelListener, AlreadyQueuedError, NotQueuedError } from '@arena/shared';
import { MatchmakingQueue } from './MatchmakingQueue';

function makePlayer(id: string, username: string): Player {
  return new Player(id, username, new Date());
}

function collectEvents(queue: MatchmakingQueue): { type: string; payload: unknown }[] {
  const events: { type: string; payload: unknown }[] = [];
  const listener: ModelListener = { modelChanged: (e) => events.push({ type: e.type, payload: e.payload }) };
  queue.addModelListener(listener);
  return events;
}

describe('MatchmakingQueue', () => {
  describe('join', () => {
    it('adds the player and returns their 1-based queue position', () => {
      const queue = new MatchmakingQueue(50);
      expect(queue.join(makePlayer('p1', 'Alice'))).toBe(1);
      expect(queue.join(makePlayer('p2', 'Bob'))).toBe(2);
      expect(queue.size()).toBe(2);
    });

    it('broadcasts queue:joined with the new position', () => {
      const queue = new MatchmakingQueue(50);
      const events = collectEvents(queue);
      queue.join(makePlayer('p1', 'Alice'));
      expect(events).toEqual([{ type: 'queue:joined', payload: { position: 1 } }]);
    });

    it('throws AlreadyQueuedError if the player is already queued', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      expect(() => queue.join(makePlayer('p1', 'Alice'))).toThrow(AlreadyQueuedError);
      expect(queue.size()).toBe(1);
    });
  });

  describe('cancel', () => {
    it('removes a queued player', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      queue.cancel('p1');
      expect(queue.size()).toBe(1);
    });

    it('broadcasts queue:cancelled', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      const events = collectEvents(queue);
      queue.cancel('p1');
      expect(events).toEqual([{ type: 'queue:cancelled', payload: {} }]);
    });

    it('throws NotQueuedError if the player is not queued', () => {
      const queue = new MatchmakingQueue(50);
      expect(() => queue.cancel('nobody')).toThrow(NotQueuedError);
    });

    it('throws NotQueuedError on a second cancel of the same player (no phantom re-add)', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.cancel('p1');
      expect(() => queue.cancel('p1')).toThrow(NotQueuedError);
    });
  });

  describe('tryPairNext', () => {
    it('returns null when fewer than two players are queued', () => {
      const queue = new MatchmakingQueue(50);
      expect(queue.tryPairNext()).toBeNull();
      queue.join(makePlayer('p1', 'Alice'));
      expect(queue.tryPairNext()).toBeNull();
    });

    it('pairs the two longest-waiting entries in FIFO order and removes them from the queue', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      queue.join(makePlayer('p3', 'Carol'));
      const pair = queue.tryPairNext();
      expect(pair).not.toBeNull();
      expect(pair!.map((e) => e.playerId)).toEqual(['p1', 'p2']);
      expect(queue.size()).toBe(1);
    });

    it('CRITICAL CHECKPOINT: does not double-pair the same player when called back-to-back', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      queue.join(makePlayer('p3', 'Carol'));
      queue.join(makePlayer('p4', 'Dan'));

      const first = queue.tryPairNext();
      const second = queue.tryPairNext();
      const third = queue.tryPairNext();

      expect(first!.map((e) => e.playerId)).toEqual(['p1', 'p2']);
      expect(second!.map((e) => e.playerId)).toEqual(['p3', 'p4']);
      expect(third).toBeNull();

      const allPairedIds = [...first!, ...second!].map((e) => e.playerId);
      expect(new Set(allPairedIds).size).toBe(4); // no id appears in both pairs
      expect(queue.size()).toBe(0);
    });

    it('CRITICAL CHECKPOINT (R2.5): stops pairing once maxConcurrentMatches is reached, leaving the rest queued in order', () => {
      const queue = new MatchmakingQueue(1);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      queue.join(makePlayer('p3', 'Carol'));
      queue.join(makePlayer('p4', 'Dan'));

      const first = queue.tryPairNext();
      expect(first!.map((e) => e.playerId)).toEqual(['p1', 'p2']);

      // Bound (1) is now reached -- further pairing attempts must return null, not touch the remaining queue.
      expect(queue.tryPairNext()).toBeNull();
      expect(queue.tryPairNext()).toBeNull();
      expect(queue.size()).toBe(2);

      // The two still-queued players remain, in their original join order -- p3 first, then p4.
      queue.cancel('p3');
      expect(queue.size()).toBe(1);
      expect(() => queue.cancel('p3')).toThrow(NotQueuedError); // p3 is gone, not silently retained
      queue.cancel('p4'); // p4 is still there, undisturbed by the blocked pairing attempts
      expect(queue.size()).toBe(0);
    });

    it('does not emit a model event on a successful pairing (match:found is broadcast by the caller once a real MatchModel exists)', () => {
      const queue = new MatchmakingQueue(50);
      queue.join(makePlayer('p1', 'Alice'));
      queue.join(makePlayer('p2', 'Bob'));
      const events = collectEvents(queue);
      queue.tryPairNext();
      expect(events).toEqual([]);
    });
  });

  describe('size', () => {
    it('reflects joins, cancels, and pairings', () => {
      const queue = new MatchmakingQueue(50);
      expect(queue.size()).toBe(0);
      queue.join(makePlayer('p1', 'Alice'));
      expect(queue.size()).toBe(1);
      queue.join(makePlayer('p2', 'Bob'));
      queue.tryPairNext();
      expect(queue.size()).toBe(0);
    });
  });
});
