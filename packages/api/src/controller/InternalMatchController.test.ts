import { Team, EndReason, MatchResult, PersistenceError, Player } from '@arena/shared';
import type { Request, Response } from 'express';
import { InternalMatchController } from './InternalMatchController';
import { PendingMatchCorrelator, CorrelatedMatchReport } from '../model/PendingMatchCorrelator';
import { MatchRepository } from '../model/MatchRepository';
import { PlayerRepository } from '../model/PlayerRepository';

function makeRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeReq(body: unknown): Request {
  return { body } as Request;
}

function makeCorrelator(overrides: Partial<PendingMatchCorrelator> = {}): PendingMatchCorrelator {
  return {
    recordBegin: jest.fn(),
    recordEnd: jest.fn(() => null),
    ...overrides,
  } as unknown as PendingMatchCorrelator;
}

function makeRepo(overrides: Partial<MatchRepository> = {}): MatchRepository {
  return {
    recordMatch: jest.fn(),
    findHistoryForPlayer: jest.fn(),
    ...overrides,
  } as unknown as MatchRepository;
}

function makePlayerRepo(overrides: Partial<PlayerRepository> = {}): PlayerRepository {
  return {
    findOrCreateByUsername: jest.fn(async (username: string) => new Player(`canonical-${username}`, username, new Date())),
    ...overrides,
  } as unknown as PlayerRepository;
}

const VALID_BEGIN_BODY = {
  matchId: 'match-1',
  participants: [
    { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
    { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
  ],
};

const VALID_END_BODY = {
  matchId: 'match-1',
  endReason: EndReason.ELIMINATION,
  winningTeam: Team.A,
  durationMs: 90_000,
  endedAt: '2026-01-01T00:00:00.000Z',
};

describe('InternalMatchController', () => {
  describe('handleBegin', () => {
    it('parses a valid body and delegates to PendingMatchCorrelator.recordBegin', async () => {
      const correlator = makeCorrelator();
      const controller = new InternalMatchController(correlator, makeRepo(), makePlayerRepo());
      const res = makeRes();

      await controller.handleBegin(makeReq(VALID_BEGIN_BODY), res);

      expect(correlator.recordBegin).toHaveBeenCalledWith('match-1', [
        { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
        { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
      ]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ acknowledged: true });
    });

    it('responds 400 when matchId is missing', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleBegin(makeReq({ participants: VALID_BEGIN_BODY.participants }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('responds 400 when participants is not an array of exactly two', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleBegin(makeReq({ matchId: 'm1', participants: [VALID_BEGIN_BODY.participants[0]] }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant has a missing playerId', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const body = {
        matchId: 'm1',
        participants: [{ username: 'Alice', team: Team.A, championId: 'korr' }, VALID_BEGIN_BODY.participants[1]],
      };
      await controller.handleBegin(makeReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant has a missing username', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const body = {
        matchId: 'm1',
        participants: [{ playerId: 'session-p1', team: Team.A, championId: 'korr' }, VALID_BEGIN_BODY.participants[1]],
      };
      await controller.handleBegin(makeReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant has an invalid team', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const body = {
        matchId: 'm1',
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: 'C', championId: 'korr' },
          VALID_BEGIN_BODY.participants[1],
        ],
      };
      await controller.handleBegin(makeReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant has a missing championId', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const body = {
        matchId: 'm1',
        participants: [{ playerId: 'session-p1', username: 'Alice', team: Team.A }, VALID_BEGIN_BODY.participants[1]],
      };
      await controller.handleBegin(makeReq(body), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when the request body is entirely missing', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleBegin(makeReq(undefined), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when a participant entry itself is null', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleBegin(makeReq({ matchId: 'm1', participants: [null, VALID_BEGIN_BODY.participants[1]] }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rethrows a non-ArenaError from the correlator uncaught', async () => {
      const correlator = makeCorrelator({
        recordBegin: jest.fn(() => {
          throw new Error('unexpected');
        }),
      });
      const controller = new InternalMatchController(correlator, makeRepo(), makePlayerRepo());
      await expect(controller.handleBegin(makeReq(VALID_BEGIN_BODY), makeRes())).rejects.toThrow('unexpected');
    });
  });

  describe('handleEnd', () => {
    it('acknowledges without persisting when only one half of the report is present', async () => {
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => null) });
      const repo = makeRepo();
      const playerRepo = makePlayerRepo();
      const controller = new InternalMatchController(correlator, repo, playerRepo);
      const res = makeRes();

      await controller.handleEnd(makeReq(VALID_END_BODY), res);

      expect(correlator.recordEnd).toHaveBeenCalled();
      expect(playerRepo.findOrCreateByUsername).not.toHaveBeenCalled();
      expect(repo.recordMatch).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ acknowledged: true });
    });

    it('resolves each participant to their canonical player id before persisting, deriving WIN/LOSS per participant', async () => {
      const correlated: CorrelatedMatchReport = {
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
          { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
        ],
        outcome: {
          endReason: EndReason.ELIMINATION,
          winningTeam: Team.A,
          durationMs: 90_000,
          endedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      };
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => correlated) });
      const repo = makeRepo();
      const playerRepo = makePlayerRepo();
      const controller = new InternalMatchController(correlator, repo, playerRepo);

      await controller.handleEnd(makeReq(VALID_END_BODY), makeRes());

      expect(playerRepo.findOrCreateByUsername).toHaveBeenCalledWith('Alice');
      expect(playerRepo.findOrCreateByUsername).toHaveBeenCalledWith('Bob');

      expect(repo.recordMatch).toHaveBeenCalledTimes(1);
      const [match, participants] = (repo.recordMatch as jest.Mock).mock.calls[0];
      expect(match.id).toBe('match-1');
      expect(match.winningTeam).toBe(Team.A);
      expect(participants).toHaveLength(2);
      // canonical ids come from PlayerRepository, NOT the transient session playerId.
      expect(participants[0]).toMatchObject({ playerId: 'canonical-Alice', result: MatchResult.WIN });
      expect(participants[1]).toMatchObject({ playerId: 'canonical-Bob', result: MatchResult.LOSS });
    });

    it('derives DRAW for both participants when winningTeam is null', async () => {
      const correlated: CorrelatedMatchReport = {
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
          { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
        ],
        outcome: {
          endReason: EndReason.TIME_LIMIT,
          winningTeam: null,
          durationMs: 300_000,
          endedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      };
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => correlated) });
      const repo = makeRepo();
      const controller = new InternalMatchController(correlator, repo, makePlayerRepo());

      await controller.handleEnd(makeReq({ ...VALID_END_BODY, winningTeam: null, endReason: EndReason.TIME_LIMIT }), makeRes());

      const [, participants] = (repo.recordMatch as jest.Mock).mock.calls[0];
      expect(participants[0].result).toBe(MatchResult.DRAW);
      expect(participants[1].result).toBe(MatchResult.DRAW);
    });

    it('responds 400 when endReason is invalid', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq({ ...VALID_END_BODY, endReason: 'NOT_REAL' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when winningTeam is neither A, B, nor null', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq({ ...VALID_END_BODY, winningTeam: 'C' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when durationMs is negative', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq({ ...VALID_END_BODY, durationMs: -1 }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when endedAt is not a valid ISO timestamp', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq({ ...VALID_END_BODY, endedAt: 'not-a-date' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when matchId is missing', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const { matchId, ...rest } = VALID_END_BODY;
      await controller.handleEnd(makeReq(rest), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when the request body is entirely missing', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      await controller.handleEnd(makeReq(undefined), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('responds 400 when endedAt is missing entirely (not just malformed)', async () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      const res = makeRes();
      const { endedAt, ...rest } = VALID_END_BODY;
      await controller.handleEnd(makeReq(rest), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('formats a PersistenceError from MatchRepository.recordMatch as a 500 via ErrorResponseView', async () => {
      const correlated: CorrelatedMatchReport = {
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
          { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
        ],
        outcome: {
          endReason: EndReason.ELIMINATION,
          winningTeam: Team.A,
          durationMs: 90_000,
          endedAt: new Date(),
        },
      };
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => correlated) });
      const repo = makeRepo({
        recordMatch: jest.fn(() => {
          throw new PersistenceError('recordMatch');
        }),
      });
      const controller = new InternalMatchController(correlator, repo, makePlayerRepo());
      const res = makeRes();

      await controller.handleEnd(makeReq(VALID_END_BODY), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PERSISTENCE_ERROR' }));
    });

    it('formats a PersistenceError from PlayerRepository.findOrCreateByUsername as a 500 via ErrorResponseView', async () => {
      const correlated: CorrelatedMatchReport = {
        participants: [
          { playerId: 'session-p1', username: 'Alice', team: Team.A, championId: 'korr' },
          { playerId: 'session-p2', username: 'Bob', team: Team.B, championId: 'vex' },
        ],
        outcome: {
          endReason: EndReason.ELIMINATION,
          winningTeam: Team.A,
          durationMs: 90_000,
          endedAt: new Date(),
        },
      };
      const correlator = makeCorrelator({ recordEnd: jest.fn(() => correlated) });
      const playerRepo = makePlayerRepo({
        findOrCreateByUsername: jest.fn(async () => {
          throw new PersistenceError('findOrCreateByUsername');
        }),
      });
      const controller = new InternalMatchController(correlator, makeRepo(), playerRepo);
      const res = makeRes();

      await controller.handleEnd(makeReq(VALID_END_BODY), res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PERSISTENCE_ERROR' }));
    });
  });

  describe('operation', () => {
    it('throws NotImplementedError — unused, Express routes call handleBegin/handleEnd directly', () => {
      const controller = new InternalMatchController(makeCorrelator(), makeRepo(), makePlayerRepo());
      expect(() => controller.operation('anything')).toThrow('not yet implemented');
    });
  });
});
