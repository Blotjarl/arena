import { Team, EndReason } from '@arena/shared';
import { PendingMatchCorrelator, BeginParticipant, MatchOutcome } from './PendingMatchCorrelator';

function makeParticipants(): BeginParticipant[] {
  return [
    { playerId: 'player-1', username: 'Alice', team: Team.A, championId: 'korr' },
    { playerId: 'player-2', username: 'Bob', team: Team.B, championId: 'vex' },
  ];
}

function makeOutcome(): MatchOutcome {
  return { endReason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 42000, endedAt: new Date('2026-01-01T00:00:00Z') };
}

describe('PendingMatchCorrelator', () => {
  it('returns null from recordEnd when begin has not been recorded yet', () => {
    const correlator = new PendingMatchCorrelator();
    expect(correlator.recordEnd('match-1', makeOutcome())).toBeNull();
  });

  it('combines begin and end into one record once both halves are present', () => {
    const correlator = new PendingMatchCorrelator();
    const participants = makeParticipants();
    const outcome = makeOutcome();
    correlator.recordBegin('match-1', participants);
    const combined = correlator.recordEnd('match-1', outcome);
    expect(combined).toEqual({ participants, outcome });
  });

  it('CRITICAL CHECKPOINT: recordBegin is idempotent — a retried begin does not create a duplicate pending entry', () => {
    const correlator = new PendingMatchCorrelator();
    const first = makeParticipants();
    const retried: BeginParticipant[] = [{ playerId: 'someone-else', username: 'Someone', team: Team.A, championId: 'rin' }];
    correlator.recordBegin('match-1', first);
    correlator.recordBegin('match-1', retried); // must be ignored — first recording wins
    const combined = correlator.recordEnd('match-1', makeOutcome());
    expect(combined?.participants).toEqual(first);
  });

  it('CRITICAL CHECKPOINT: recordEnd is idempotent — calling it twice does not return a second combined record', () => {
    const correlator = new PendingMatchCorrelator();
    correlator.recordBegin('match-1', makeParticipants());
    const outcome = makeOutcome();
    const firstResult = correlator.recordEnd('match-1', outcome);
    const secondResult = correlator.recordEnd('match-1', outcome);
    expect(firstResult).not.toBeNull();
    expect(secondResult).toBeNull();
  });

  it('CRITICAL CHECKPOINT: a retried begin after completion does not resurrect a finished match', () => {
    const correlator = new PendingMatchCorrelator();
    correlator.recordBegin('match-1', makeParticipants());
    correlator.recordEnd('match-1', makeOutcome());
    correlator.recordBegin('match-1', makeParticipants()); // retried begin, arriving after completion
    expect(correlator.recordEnd('match-1', makeOutcome())).toBeNull();
  });

  it('tracks multiple matchIds independently', () => {
    const correlator = new PendingMatchCorrelator();
    correlator.recordBegin('match-1', makeParticipants());
    correlator.recordBegin('match-2', makeParticipants());
    expect(correlator.recordEnd('match-2', makeOutcome())).not.toBeNull();
    expect(correlator.recordEnd('match-1', makeOutcome())).not.toBeNull();
  });

  it('a repeated recordEnd arriving before recordBegin does not throw and stays null (still no begin to pair with)', () => {
    const correlator = new PendingMatchCorrelator();
    const outcome = makeOutcome();
    expect(correlator.recordEnd('match-1', outcome)).toBeNull();
    expect(correlator.recordEnd('match-1', outcome)).toBeNull(); // idempotent — no duplicate pending entry
    correlator.recordBegin('match-1', makeParticipants());
    // Per docs/01_class_list.md, recordBegin returns void — an end that arrived before begin is not
    // retroactively combined by this call; only a *new* recordEnd call can complete the pairing.
  });
});
