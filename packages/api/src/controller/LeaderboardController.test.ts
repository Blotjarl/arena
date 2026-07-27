import type { Request, Response } from 'express';
import { LeaderboardController } from './LeaderboardController';
import { LeaderboardRepository } from '../model/LeaderboardRepository';
import { LeaderboardEntry } from '../model/LeaderboardEntry';

function makeRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeReq(query: Record<string, unknown>): Request {
  return { query } as unknown as Request;
}

function makeRepo(overrides: Partial<LeaderboardRepository> = {}): LeaderboardRepository {
  return {
    computeLeaderboard: jest.fn(async () => []),
    computeChampionWinRates: jest.fn(async () => []),
    ...overrides,
  } as unknown as LeaderboardRepository;
}

describe('LeaderboardController', () => {
  describe('getLeaderboard', () => {
    it('defaults minGames to 1 when the query param is omitted', async () => {
      const repo = makeRepo();
      const controller = new LeaderboardController(repo);
      await controller.getLeaderboard(makeReq({}), makeRes());
      expect(repo.computeLeaderboard).toHaveBeenCalledWith(1);
    });

    it('parses an explicit minGames query param', async () => {
      const repo = makeRepo();
      const controller = new LeaderboardController(repo);
      await controller.getLeaderboard(makeReq({ minGames: '5' }), makeRes());
      expect(repo.computeLeaderboard).toHaveBeenCalledWith(5);
    });

    it('accepts minGames=0', async () => {
      const repo = makeRepo();
      const controller = new LeaderboardController(repo);
      await controller.getLeaderboard(makeReq({ minGames: '0' }), makeRes());
      expect(repo.computeLeaderboard).toHaveBeenCalledWith(0);
    });

    it('formats the computed entries via LeaderboardResponseView', async () => {
      const entry = new LeaderboardEntry('p1', 'Alice', 7, 3, 0, 10, 0.7);
      const repo = makeRepo({ computeLeaderboard: jest.fn(async () => [entry]) });
      const controller = new LeaderboardController(repo);
      const res = makeRes();

      await controller.getLeaderboard(makeReq({}), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([{ username: 'Alice', wins: 7, losses: 3, draws: 0, gamesPlayed: 10, winRate: 0.7 }]);
    });

    it('responds 400 when minGames is negative', async () => {
      const controller = new LeaderboardController(makeRepo());
      const res = makeRes();
      await controller.getLeaderboard(makeReq({ minGames: '-1' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('responds 400 when minGames is not an integer', async () => {
      const controller = new LeaderboardController(makeRepo());
      const res = makeRes();
      await controller.getLeaderboard(makeReq({ minGames: 'abc' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when minGames is not a string (e.g. a repeated query param parsed as an array)', async () => {
      const controller = new LeaderboardController(makeRepo());
      const res = makeRes();
      await controller.getLeaderboard(makeReq({ minGames: ['1', '2'] }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rethrows a non-ArenaError from the repository uncaught', async () => {
      const repo = makeRepo({
        computeLeaderboard: jest.fn(async () => {
          throw new Error('unexpected');
        }),
      });
      const controller = new LeaderboardController(repo);
      await expect(controller.getLeaderboard(makeReq({}), makeRes())).rejects.toThrow('unexpected');
    });
  });

  describe('getChampionWinRates', () => {
    it('delegates to LeaderboardRepository.computeChampionWinRates and returns the DTOs unmodified', async () => {
      const winRates = [{ championId: 'korr', gamesPlayed: 10, winRate: 0.5 }];
      const repo = makeRepo({ computeChampionWinRates: jest.fn(async () => winRates) });
      const controller = new LeaderboardController(repo);
      const res = makeRes();

      await controller.getChampionWinRates(makeReq({}), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(winRates);
    });

    it('rethrows a non-ArenaError from the repository uncaught', async () => {
      const repo = makeRepo({
        computeChampionWinRates: jest.fn(async () => {
          throw new Error('unexpected');
        }),
      });
      const controller = new LeaderboardController(repo);
      await expect(controller.getChampionWinRates(makeReq({}), makeRes())).rejects.toThrow('unexpected');
    });
  });

  describe('operation', () => {
    it('throws NotImplementedError — unused, Express routes call getLeaderboard/getChampionWinRates directly', () => {
      const controller = new LeaderboardController(makeRepo());
      expect(() => controller.operation('anything')).toThrow('not yet implemented');
    });
  });
});
