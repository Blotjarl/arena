import { ArenaError, ValidationError, PlayerNotFoundError, PersistenceError } from '@arena/shared';
import { ErrorResponseView } from './ErrorResponseView';

class UnmappedError extends ArenaError {
  readonly code = 'SOME_UNMAPPED_CODE';
  constructor() {
    super('an error type this view has no explicit mapping for');
  }
}

describe('ErrorResponseView', () => {
  describe('render', () => {
    it('maps ValidationError to 400', () => {
      const view = new ErrorResponseView();
      const { status, body } = view.render(new ValidationError('matchId', 'must be a non-empty string'));
      expect(status).toBe(400);
      expect(body).toEqual({ code: 'VALIDATION_ERROR', message: 'Invalid matchId: must be a non-empty string' });
    });

    it('maps PlayerNotFoundError to 404', () => {
      const view = new ErrorResponseView();
      const { status, body } = view.render(new PlayerNotFoundError('p1'));
      expect(status).toBe(404);
      expect(body.code).toBe('PLAYER_NOT_FOUND');
    });

    it('maps PersistenceError to 500', () => {
      const view = new ErrorResponseView();
      const { status, body } = view.render(new PersistenceError('recordMatch'));
      expect(status).toBe(500);
      expect(body.code).toBe('PERSISTENCE_ERROR');
    });

    it('falls back to 500 for a code with no explicit mapping', () => {
      const view = new ErrorResponseView();
      const { status, body } = view.render(new UnmappedError());
      expect(status).toBe(500);
      expect(body.code).toBe('SOME_UNMAPPED_CODE');
    });
  });
});
