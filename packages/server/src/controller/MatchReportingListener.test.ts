import { Player, Team, EndReason, ModelEvent } from '@arena/shared';
import { MatchReportingListener } from './MatchReportingListener';
import { MatchModel } from '../model/MatchModel';
import { MatchReportingClient } from './MatchReportingClient';

function makeReportingClient(): jest.Mocked<Pick<MatchReportingClient, 'reportMatchBegin' | 'reportMatchEnd'>> {
  return {
    reportMatchBegin: jest.fn().mockResolvedValue(undefined),
    reportMatchEnd: jest.fn().mockResolvedValue(undefined),
  };
}

describe('MatchReportingListener', () => {
  it('registers itself as a listener on the given MatchModel', () => {
    const players: [Player, Player] = [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
    const match = new MatchModel('m1', players);
    const addListenerSpy = jest.spyOn(match, 'addModelListener');
    const reportingClient = makeReportingClient();

    const listener = new MatchReportingListener(match, players, reportingClient as unknown as MatchReportingClient);

    expect(addListenerSpy).toHaveBeenCalledWith(listener);
  });

  describe("on 'match:start'", () => {
    it('reports match begin with each participant zipped by playerId (not array order)', () => {
      const players: [Player, Player] = [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];

      // MatchModel always constructs Team A from players[0]/Team B from players[1] (see MatchModel
      // constructor). Pass the *reversed* array to the listener so a naive "zip by array index"
      // implementation would silently mismatch playerId/username with the wrong team/championId, while a
      // correct playerId-keyed zip still gets it right.
      const reversedPlayers: [Player, Player] = [players[1], players[0]];
      const match = new MatchModel('m2', players);
      const reportingClient = makeReportingClient();
      new MatchReportingListener(match, reversedPlayers, reportingClient as unknown as MatchReportingClient);

      match.selectChampion('p1', 'korr');
      match.selectChampion('p2', 'vex');

      expect(reportingClient.reportMatchBegin).toHaveBeenCalledTimes(1);
      const [matchId, participants] = reportingClient.reportMatchBegin.mock.calls[0];
      expect(matchId).toBe('m2');
      expect(participants).toHaveLength(2);

      const forAlice = participants.find((p) => p.playerId === 'p1')!;
      expect(forAlice.username).toBe('Alice');
      expect(forAlice.team).toBe(Team.A);
      expect(forAlice.championId).toBe('korr');

      const forBob = participants.find((p) => p.playerId === 'p2')!;
      expect(forBob.username).toBe('Bob');
      expect(forBob.team).toBe(Team.B);
      expect(forBob.championId).toBe('vex');
    });

    it('does not report until both players have selected a champion', () => {
      const players: [Player, Player] = [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
      const match = new MatchModel('m1', players);
      const reportingClient = makeReportingClient();
      new MatchReportingListener(match, players, reportingClient as unknown as MatchReportingClient);

      match.selectChampion('p1', 'korr');
      expect(reportingClient.reportMatchBegin).not.toHaveBeenCalled();
    });

    it('CRITICAL R7.2: a match that times out during Champion Select never calls reportMatchBegin', () => {
      const players: [Player, Player] = [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
      const match = new MatchModel('m1', players);
      match.championSelectDeadline = Date.now() - 1;
      const reportingClient = makeReportingClient();
      new MatchReportingListener(match, players, reportingClient as unknown as MatchReportingClient);

      match.tick(0.05);

      expect(reportingClient.reportMatchBegin).not.toHaveBeenCalled();
      expect(reportingClient.reportMatchEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe("on 'match:end'", () => {
    it('reports match end with the reason/winningTeam/durationMs from the event and an ISO endedAt', () => {
      const players: [Player, Player] = [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
      const match = new MatchModel('m1', players);
      const reportingClient = makeReportingClient();
      new MatchReportingListener(match, players, reportingClient as unknown as MatchReportingClient);

      match.selectChampion('p1', 'korr');
      match.selectChampion('p2', 'vex');
      // Force a deterministic elimination win without depending on real combat numbers.
      (match as unknown as { checkWinConditions: () => EndReason | null }).checkWinConditions = () =>
        EndReason.ELIMINATION;
      (match as unknown as { determineWinner: (r: EndReason) => Team | null }).determineWinner = () => Team.A;

      match.tick(0.05);

      expect(reportingClient.reportMatchEnd).toHaveBeenCalledTimes(1);
      const [matchId, outcome] = reportingClient.reportMatchEnd.mock.calls[0];
      expect(matchId).toBe('m1');
      expect(outcome.endReason).toBe(EndReason.ELIMINATION);
      expect(outcome.winningTeam).toBe(Team.A);
      expect(typeof outcome.durationMs).toBe('number');
      expect(() => new Date(outcome.endedAt).toISOString()).not.toThrow();
      expect(Number.isNaN(new Date(outcome.endedAt).getTime())).toBe(false);
    });

    it('does not call reportMatchBegin for a non-start event, and does not call reportMatchEnd for a non-end event', () => {
      const players: [Player, Player] = [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
      const match = new MatchModel('m1', players);
      const reportingClient = makeReportingClient();
      const listener = new MatchReportingListener(match, players, reportingClient as unknown as MatchReportingClient);

      listener.modelChanged(new ModelEvent(match, 'state', {}));
      listener.modelChanged(new ModelEvent(match, 'player_disconnected', {}));

      expect(reportingClient.reportMatchBegin).not.toHaveBeenCalled();
      expect(reportingClient.reportMatchEnd).not.toHaveBeenCalled();
    });
  });

  it('CRITICAL: a normal match calls reportMatchBegin exactly once and reportMatchEnd exactly once', () => {
    const players: [Player, Player] = [new Player('p1', 'Alice', new Date()), new Player('p2', 'Bob', new Date())];
    const match = new MatchModel('m1', players);
    const reportingClient = makeReportingClient();
    new MatchReportingListener(match, players, reportingClient as unknown as MatchReportingClient);

    match.selectChampion('p1', 'korr');
    match.selectChampion('p2', 'vex');
    (match as unknown as { checkWinConditions: () => EndReason | null }).checkWinConditions = () =>
      EndReason.ELIMINATION;

    match.tick(0.05);
    match.tick(0.05);
    match.tick(0.05);

    expect(reportingClient.reportMatchBegin).toHaveBeenCalledTimes(1);
    expect(reportingClient.reportMatchEnd).toHaveBeenCalledTimes(1);
  });
});
