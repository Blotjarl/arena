import { InvalidChampionSelectionError, SelectionWindowExpiredError, InvalidMatchPhaseError } from '@arena/shared';
import { ChampionSelectController } from './ChampionSelectController';
import type { MatchModel } from '../model/MatchModel';
import type { MatchBroadcastView } from '../view/MatchBroadcastView';

function makeMatch(selectChampion: (playerId: string, championId: string) => void): MatchModel {
  return { id: 'm1', selectChampion: jest.fn(selectChampion) } as unknown as MatchModel;
}

function makeView(): MatchBroadcastView & { modelChanged: jest.Mock } {
  return { modelChanged: jest.fn() } as unknown as MatchBroadcastView & { modelChanged: jest.Mock };
}

describe('ChampionSelectController', () => {
  describe('operation', () => {
    it('delegates to MatchModel.selectChampion on success', () => {
      const match = makeMatch(() => {});
      const view = makeView();
      const controller = new ChampionSelectController(match, view);
      controller.operation('champion:select', { playerId: 'p1', championId: 'vex' });
      expect(match.selectChampion).toHaveBeenCalledWith('p1', 'vex');
      expect(view.modelChanged).not.toHaveBeenCalled();
    });

    it('catches InvalidChampionSelectionError and forwards a targeted error event to the view', () => {
      const match = makeMatch(() => {
        throw new InvalidChampionSelectionError('nope');
      });
      const view = makeView();
      const controller = new ChampionSelectController(match, view);
      expect(() => controller.operation('champion:select', { playerId: 'p1', championId: 'nope' })).not.toThrow();
      expect(view.modelChanged).toHaveBeenCalledTimes(1);
      const event = view.modelChanged.mock.calls[0][0];
      expect(event.type).toBe('error');
      expect(event.payload).toMatchObject({ playerId: 'p1', code: 'INVALID_CHAMPION_SELECTION' });
    });

    it('catches SelectionWindowExpiredError and forwards a targeted error event to the view', () => {
      const match = makeMatch(() => {
        throw new SelectionWindowExpiredError('m1');
      });
      const view = makeView();
      const controller = new ChampionSelectController(match, view);
      controller.operation('champion:select', { playerId: 'p1', championId: 'vex' });
      expect(view.modelChanged).toHaveBeenCalledTimes(1);
      expect(view.modelChanged.mock.calls[0][0].payload).toMatchObject({ code: 'SELECTION_WINDOW_EXPIRED' });
    });

    it('lets InvalidMatchPhaseError propagate uncaught (misbehaving client, not a normal validation failure)', () => {
      const match = makeMatch(() => {
        throw new InvalidMatchPhaseError('m1', 'CHAMPION_SELECT', 'ACTIVE');
      });
      const view = makeView();
      const controller = new ChampionSelectController(match, view);
      expect(() => controller.operation('champion:select', { playerId: 'p1', championId: 'vex' })).toThrow(
        InvalidMatchPhaseError,
      );
      expect(view.modelChanged).not.toHaveBeenCalled();
    });
  });
});
