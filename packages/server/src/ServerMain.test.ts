import { ServerMain } from './ServerMain';

describe('ServerMain', () => {
  describe('main', () => {
    it('starts listening on a free port without throwing (smoke test — see class doc comment)', async () => {
      await expect(ServerMain.main(0)).resolves.toBeUndefined();
    });
  });
});
