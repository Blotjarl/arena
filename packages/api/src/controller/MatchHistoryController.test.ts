import { MatchResult, EndReason } from '@arena/shared';
import type { Request, Response } from 'express';
import { MatchHistoryController } from './MatchHistoryController';
import { MatchRepository, MatchHistoryRow } from '../model/MatchRepository';

function makeRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeReq(params: Record<string, string>, query: Record<string, unknown>): Request {
  return { params, query } as unknown as Request;
}

function makeRepo(overrides: Partial<MatchRepository> = {}): MatchRepository {
  return {
    recordMatch: jest.fn(),
    findHistoryForPlayer: jest.fn(async () => [] as MatchHistoryRow[]),
    ...overrides,
  } as unknown as MatchRepository;
}

const SAMPLE_ROW: MatchHistoryRow = {
  matchId: 'match-1',
  opponentUsername: 'Bob',
  championId: 'korr',
  result: MatchResult.WIN,
  endReason: EndReason.ELIMINATION,
  durationMs: 90_000,
  endedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('MatchHistoryController', () => {
  describe('getHistory', () => {
    it('parses page/pageSize, delegates to MatchRepository, and formats via the response view', async () => {
      const repo = makeRepo({ findHistoryForPlayer: jest.fn(async () => [SAMPLE_ROW]) });
      const controller = new MatchHistoryController(repo);
      const res = makeRes();

      await controller.getHistory(makeReq({ id: 'p1' }, { page: '2', pageSize: '10' }), res);

      expect(repo.findHistoryForPlayer).toHaveBeenCalledWith('p1', 2, 10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({ matchId: 'match-1', opponentUsername: 'Bob', endedAt: '2026-01-01T00:00:00.000Z' }),
      ]);
    });

    it('responds 200 with an empty array for a player with no history', async () => {
      const repo = makeRepo();
      const controller = new MatchHistoryController(repo);
      const res = makeRes();

      await controller.getHistory(makeReq({ id: 'p1' }, { page: '1', pageSize: '10' }), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('responds 400 when page is missing', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { pageSize: '10' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('responds 400 when pageSize is missing', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { page: '1' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when page is not a positive integer', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { page: '0', pageSize: '10' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when page is not numeric', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { page: 'abc', pageSize: '10' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when pageSize is not a positive integer', async () => {
      const controller = new MatchHistoryController(makeRepo());
      const res = makeRes();
      await controller.getHistory(makeReq({ id: 'p1' }, { page: '1', pageSize: '-5' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rethrows a non-ArenaError from the repository uncaught', async () => {
      const repo = makeRepo({
        findHistoryForPlayer: jest.fn(async () => {
          throw new Error('unexpected');
        }),
      });
      const controller = new MatchHistoryController(repo);
      await expect(controller.getHistory(makeReq({ id: 'p1' }, { page: '1', pageSize: '10' }), makeRes())).rejects.toThrow(
        'unexpected',
      );
    });
  });

  describe('operation', () => {
    it('throws NotImplementedError — unused, the Express route calls getHistory directly', () => {
      const controller = new MatchHistoryController(makeRepo());
      expect(() => controller.operation('anything')).toThrow('not yet implemented');
    });
  });
});
