import { Team, EndReason } from '@arena/shared';
import { MatchReportingClient } from './MatchReportingClient';

describe('MatchReportingClient', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('reportMatchBegin', () => {
    it('POSTs the matchId and participants to /internal/matches/begin', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
      const client = new MatchReportingClient('http://api.local');
      await client.reportMatchBegin('m1', [{ playerId: 'p1', username: 'Alice', team: Team.A, championId: 'vex' }]);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.local/internal/matches/begin',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({
        matchId: 'm1',
        participants: [{ playerId: 'p1', username: 'Alice', team: Team.A, championId: 'vex' }],
      });
    });

    it('CRITICAL: a rejected fetch (network failure) does not propagate — resolves rather than throwing', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const client = new MatchReportingClient('http://api.local');

      await expect(client.reportMatchBegin('m1', [])).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('logs but does not throw when the response is a non-2xx status', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const client = new MatchReportingClient('http://api.local');

      await expect(client.reportMatchBegin('m1', [])).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('reportMatchEnd', () => {
    it('POSTs the matchId and outcome to /internal/matches/end', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
      const client = new MatchReportingClient('http://api.local');
      const endedAt = new Date().toISOString();
      await client.reportMatchEnd('m1', { endReason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 5000, endedAt });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.local/internal/matches/end',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toEqual({
        matchId: 'm1',
        endReason: EndReason.ELIMINATION,
        winningTeam: Team.A,
        durationMs: 5000,
        endedAt,
      });
    });

    it('CRITICAL: a rejected fetch does not propagate into match simulation', async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const client = new MatchReportingClient('http://api.local');

      await expect(
        client.reportMatchEnd('m1', { endReason: EndReason.TIME_LIMIT, winningTeam: null, durationMs: 1, endedAt: '' }),
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
