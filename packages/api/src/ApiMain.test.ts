import { ApiMain } from './ApiMain';

describe('ApiMain', () => {
  afterEach(async () => {
    await ApiMain.stop();
    delete process.env.PORT;
    delete process.env.DATABASE_URL;
  });

  describe('main', () => {
    it('builds the app and starts listening without throwing', async () => {
      process.env.PORT = '0'; // OS-assigned ephemeral port -- avoids clashing with a real dev instance
      process.env.DATABASE_URL = 'postgresql://arena:arena@localhost:55432/arena_test';

      await expect(ApiMain.main()).resolves.toBeUndefined();
    });

    it('can be stopped and started again cleanly (no leaked listener)', async () => {
      process.env.PORT = '0';
      process.env.DATABASE_URL = 'postgresql://arena:arena@localhost:55432/arena_test';

      await ApiMain.main();
      await ApiMain.stop();
      await expect(ApiMain.main()).resolves.toBeUndefined();
    });

    it('actually serves requests on the wired routes, not just accepts connections', async () => {
      process.env.PORT = '41234'; // fixed, not '0' -- the test needs to know the URL to hit
      process.env.DATABASE_URL = 'postgresql://arena:arena@localhost:55432/arena_test';
      await ApiMain.main();

      const leaderboardRes = await fetch('http://localhost:41234/leaderboard');
      expect(leaderboardRes.status).toBe(200);
      expect(Array.isArray(await leaderboardRes.json())).toBe(true);

      const championsRes = await fetch('http://localhost:41234/leaderboard/champions');
      expect(championsRes.status).toBe(200);

      const historyRes = await fetch('http://localhost:41234/players/nobody-has-played-me/matches?page=1&pageSize=10');
      expect(historyRes.status).toBe(200);
      expect(await historyRes.json()).toEqual([]);

      // Validation still runs through the real controller -- a bad param is rejected, not silently ignored.
      const badHistoryRes = await fetch('http://localhost:41234/players/p1/matches');
      expect(badHistoryRes.status).toBe(400);

      // The internal begin/end routes are wired too -- an invalid body is rejected via the same
      // controller-catches/view-shows path, proving InternalMatchController is reachable.
      const beginRes = await fetch('http://localhost:41234/internal/matches/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(beginRes.status).toBe(400);

      const endRes = await fetch('http://localhost:41234/internal/matches/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(endRes.status).toBe(400);
    });
  });

  describe('stop', () => {
    it('is a no-op when main() has not been called', async () => {
      await expect(ApiMain.stop()).resolves.toBeUndefined();
    });
  });
});
