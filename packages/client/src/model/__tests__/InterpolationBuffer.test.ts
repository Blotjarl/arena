import { InterpolationBuffer } from '../InterpolationBuffer';
import { ClientMatchModel } from '../ClientMatchModel';
import { Position, Team, ConnectionStatus } from '@arena/shared';
import type { MatchStatePayload, ParticipantSnapshot } from '@arena/shared';

const makeParticipant = (playerId: string, x: number, y: number): ParticipantSnapshot => ({
  playerId,
  team: Team.A,
  championId: 'korr',
  position: new Position(x, y),
  health: 180,
  resource: 100,
  cooldownsRemaining: {},
  crowdControlled: false,
  connectionStatus: ConnectionStatus.CONNECTED,
  alive: true,
});

const makeSnapshot = (tick: number, x: number, y: number): MatchStatePayload => ({
  matchId: 'match-1',
  tick,
  participants: [makeParticipant('p1', x, y), makeParticipant('p2', 0, 0)],
});

describe('InterpolationBuffer', () => {
  describe('push()', () => {
    it('retains up to capacity snapshots and evicts the oldest when full', () => {
      const buf = new InterpolationBuffer(2);
      buf.push(makeSnapshot(1, 0, 0));
      buf.push(makeSnapshot(2, 10, 0));
      buf.push(makeSnapshot(3, 20, 0)); // evicts tick 1
      // The buffer should still return a valid Position (tick 1 is gone)
      const pos = buf.getInterpolatedPosition('p1', Date.now());
      expect(pos).toBeInstanceOf(Position);
    });
  });

  describe('getInterpolatedPosition()', () => {
    it('returns a Position when only one snapshot is buffered', () => {
      const buf = new InterpolationBuffer(10);
      buf.push(makeSnapshot(1, 5, 10));
      const pos = buf.getInterpolatedPosition('p1', 1000);
      expect(pos).toBeInstanceOf(Position);
      expect(pos.x).toBe(5);
      expect(pos.y).toBe(10);
    });

    it('does not throw when the buffer is empty — returns a safe default', () => {
      const buf = new InterpolationBuffer(5);
      expect(() => buf.getInterpolatedPosition('p1', 1000)).not.toThrow();
      expect(buf.getInterpolatedPosition('p1', 1000)).toBeInstanceOf(Position);
    });

    it('linearly interpolates between two snapshots at the midpoint', () => {
      const buf = new InterpolationBuffer(5);
      // tick 10 → x=0, tick 11 → x=100. Virtual timestamps: tick 11 = now, tick 10 = now-50ms.
      // At now-25ms (midpoint), expected x ≈ 50.
      const now = 1000;
      buf.push(makeSnapshot(10, 0, 0));
      buf.push(makeSnapshot(11, 100, 0));
      const pos = buf.getInterpolatedPosition('p1', now - 25);
      expect(pos.x).toBeCloseTo(50, 0);
    });

    it('returns the most recent position when now is past the last snapshot', () => {
      const buf = new InterpolationBuffer(5);
      buf.push(makeSnapshot(10, 0, 0));
      buf.push(makeSnapshot(11, 100, 0));
      // now is well after tick 11's virtual time
      const pos = buf.getInterpolatedPosition('p1', 99999);
      expect(pos).toBeInstanceOf(Position);
    });

    // ── CRITICAL CHECKPOINT ─────────────────────────────────────────────────
    it('CRITICAL: does not mutate ClientMatchModel or any external state', () => {
      const buf = new InterpolationBuffer(5);
      const matchModel = new ClientMatchModel();
      buf.push(makeSnapshot(1, 0, 0));
      buf.push(makeSnapshot(2, 100, 0));

      const stateBefore = JSON.stringify(matchModel);
      buf.getInterpolatedPosition('p1', 1000);
      const stateAfter = JSON.stringify(matchModel);

      expect(stateAfter).toBe(stateBefore); // ClientMatchModel entirely untouched
    });

    it('CRITICAL: does not mutate the buffered snapshots', () => {
      const buf = new InterpolationBuffer(5);
      const snap1 = makeSnapshot(1, 0, 0);
      const snap2 = makeSnapshot(2, 100, 0);
      buf.push(snap1);
      buf.push(snap2);

      buf.getInterpolatedPosition('p1', 1000);

      expect(snap1.participants[0].position.x).toBe(0);
      expect(snap2.participants[0].position.x).toBe(100);
    });
  });
});
