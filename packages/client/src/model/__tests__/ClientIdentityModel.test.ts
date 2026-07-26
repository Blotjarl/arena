import { ClientIdentityModel } from '../ClientIdentityModel';
import { PlayerNotFoundError } from '@arena/shared';

describe('ClientIdentityModel', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('identify()', () => {
    it('stores username exactly as given — no alteration', () => {
      const m = new ClientIdentityModel();
      m.identify('TestUser');
      expect(m.username).toBe('TestUser');
    });

    it('persists username to sessionStorage', () => {
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(sessionStorage.getItem('arena:username')).toBe('Raj');
    });

    it('restores playerId from sessionStorage if already set (page-reload scenario)', () => {
      sessionStorage.setItem('arena:playerId', 'player-99');
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(m.playerId).toBe('player-99');
    });

    it('leaves playerId null when sessionStorage has no stored playerId', () => {
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(m.playerId).toBeNull();
    });
  });

  describe('getPlayerId()', () => {
    it('throws PlayerNotFoundError before identify() is called', () => {
      expect(() => new ClientIdentityModel().getPlayerId()).toThrow(PlayerNotFoundError);
    });

    it('throws PlayerNotFoundError after identify() when server has not yet set playerId', () => {
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(() => m.getPlayerId()).toThrow(PlayerNotFoundError);
    });

    it('returns playerId once the controller has set it', () => {
      const m = new ClientIdentityModel();
      m.playerId = 'player-42';
      expect(m.getPlayerId()).toBe('player-42');
    });

    it('returns the restored playerId after page-reload scenario', () => {
      sessionStorage.setItem('arena:playerId', 'player-7');
      const m = new ClientIdentityModel();
      m.identify('Raj');
      expect(m.getPlayerId()).toBe('player-7');
    });
  });
});
