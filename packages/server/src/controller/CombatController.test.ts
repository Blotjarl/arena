import { InvalidMatchPhaseError, EffectType } from '@arena/shared';
import { CombatController } from './CombatController';
import type { MatchModel } from '../model/MatchModel';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';

function makeMatch(overrides: Partial<MatchModel> = {}): MatchModel {
  return {
    id: 'm1',
    submitMove: jest.fn(),
    submitAbility: jest.fn(),
    ...overrides,
  } as unknown as MatchModel;
}

const view = {} as MatchBroadcastView;

describe('CombatController', () => {
  describe('operation', () => {
    it('forwards movement input to MatchModel.submitMove', () => {
      const match = makeMatch();
      const controller = new CombatController(match, view);
      controller.operation('match:action', { playerId: 'p1', input: { dx: 1, dy: 0 } });
      expect(match.submitMove).toHaveBeenCalledWith('p1', { dx: 1, dy: 0 });
      expect(match.submitAbility).not.toHaveBeenCalled();
    });

    it('forwards an ability-use request to MatchModel.submitAbility, distinguished by abilityId', () => {
      const match = makeMatch();
      const controller = new CombatController(match, view);
      controller.operation('match:action', { playerId: 'p1', input: { abilityId: 'bolt', targetPlayerId: 'p2' } });
      expect(match.submitAbility).toHaveBeenCalledWith('p1', { abilityId: 'bolt', targetPlayerId: 'p2' });
      expect(match.submitMove).not.toHaveBeenCalled();
    });

    it('swallows InvalidMatchPhaseError rather than throwing (R4.1)', () => {
      const match = makeMatch({
        submitMove: jest.fn(() => {
          throw new InvalidMatchPhaseError('m1', 'ACTIVE', 'CHAMPION_SELECT');
        }),
      });
      const controller = new CombatController(match, view);
      expect(() => controller.operation('match:action', { playerId: 'p1', input: { dx: 1, dy: 0 } })).not.toThrow();
    });

    it('is a no-op when payload is missing', () => {
      const match = makeMatch();
      const controller = new CombatController(match, view);
      expect(() => controller.operation('match:action')).not.toThrow();
      expect(match.submitMove).not.toHaveBeenCalled();
      expect(match.submitAbility).not.toHaveBeenCalled();
    });

    it('references EffectType only to document ability payload shape (sanity import check)', () => {
      expect(EffectType.DAMAGE).toBeDefined();
    });
  });
});
