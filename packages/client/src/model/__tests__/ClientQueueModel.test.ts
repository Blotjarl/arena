import { ClientQueueModel } from '../ClientQueueModel';
import { Team } from '@arena/shared';

const makeMatchFoundPayload = () => ({
  matchId: 'match-1',
  team: Team.A,
  opponentUsername: 'Opponent',
  roster: [],
});

describe('ClientQueueModel', () => {
  it('starts with idle status and null position', () => {
    const m = new ClientQueueModel();
    expect(m.status).toBe('idle');
    expect(m.position).toBeNull();
  });

  describe('setQueued()', () => {
    it('stores position exactly as given by the server — no alteration', () => {
      const m = new ClientQueueModel();
      m.setQueued(3);
      expect(m.position).toBe(3);
    });

    it('sets status to queued', () => {
      const m = new ClientQueueModel();
      m.setQueued(1);
      expect(m.status).toBe('queued');
    });
  });

  describe('setCancelled()', () => {
    it('resets status to idle and clears position', () => {
      const m = new ClientQueueModel();
      m.setQueued(2);
      m.setCancelled();
      expect(m.status).toBe('idle');
      expect(m.position).toBeNull();
    });
  });

  describe('setMatched()', () => {
    it('stores the match-found payload exactly as given — same reference, no alteration', () => {
      const m = new ClientQueueModel();
      const payload = makeMatchFoundPayload();
      m.setMatched(payload);
      expect(m.matchPayload).toBe(payload); // same reference — not cloned or mutated
    });

    it('sets status to matched and clears position', () => {
      const m = new ClientQueueModel();
      m.setQueued(1);
      m.setMatched(makeMatchFoundPayload());
      expect(m.status).toBe('matched');
      expect(m.position).toBeNull();
    });
  });
});
