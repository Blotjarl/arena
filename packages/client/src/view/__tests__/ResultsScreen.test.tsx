import { render, screen, fireEvent, act } from '@testing-library/react';
import { Team, EndReason } from '@arena/shared';
import { ResultsView, ResultsScreen } from '../ResultsView';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { LobbyController } from '../../controller/LobbyController';

function makeMockController(): LobbyController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as LobbyController & { operation: jest.Mock };
}

function makeQueueOnTeam(team: Team): ClientQueueModel {
  const queue = new ClientQueueModel();
  queue.setMatched({ matchId: 'm1', team, opponentUsername: 'Bob', roster: [] });
  return queue;
}

describe('ResultsScreen', () => {
  it('shows a waiting message before match:end arrives', () => {
    const view = new ResultsView(new ClientMatchModel(), new ClientQueueModel(), makeMockController());
    render(<ResultsScreen view={view} />);
    expect(screen.getByText(/Waiting for match result/)).toBeTruthy();
  });

  it('shows Victory when the winning team matches my own team', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 42000 });
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());

    render(<ResultsScreen view={view} />);

    expect(screen.getByText('Victory')).toBeTruthy();
    expect(screen.getByText(/Reason: Elimination/)).toBeTruthy();
    expect(screen.getByText(/Duration: 42.0s/)).toBeTruthy();
  });

  it('shows Defeat when the winning team is the opponent', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.TIME_LIMIT, winningTeam: Team.B, durationMs: 300000 });
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());

    render(<ResultsScreen view={view} />);

    expect(screen.getByText('Defeat')).toBeTruthy();
    expect(screen.getByText(/Reason: Time limit reached/)).toBeTruthy();
  });

  it('shows Draw when winningTeam is null', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.TIME_LIMIT, winningTeam: null, durationMs: 300000 });
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());

    render(<ResultsScreen view={view} />);

    expect(screen.getByText('Draw')).toBeTruthy();
  });

  it('shows the disconnect-forfeit and selection-timeout reason labels', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.DISCONNECT_FORFEIT, winningTeam: Team.A, durationMs: 1000 });
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());
    render(<ResultsScreen view={view} />);
    expect(screen.getByText(/Reason: Opponent disconnected/)).toBeTruthy();
  });

  it('clicking Return to Queue dispatches returnToQueue on the (Lobby) controller', () => {
    const match = new ClientMatchModel();
    match.applyMatchEnd({ matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 1000 });
    const controller = makeMockController();
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), controller);

    render(<ResultsScreen view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Queue' }));

    expect(controller.operation).toHaveBeenCalledWith('returnToQueue');
  });

  it('CRITICAL CHECKPOINT: a match:end delivered after mount re-renders in place via the real notifyChanged pipeline', () => {
    const match = new ClientMatchModel();
    const view = new ResultsView(match, makeQueueOnTeam(Team.A), makeMockController());

    render(<ResultsScreen view={view} />);
    expect(screen.getByText(/Waiting for match result/)).toBeTruthy();

    act(() => {
      match.applyMatchEnd({ matchId: 'm1', reason: EndReason.ELIMINATION, winningTeam: Team.A, durationMs: 5000 });
    });

    expect(screen.getByText('Victory')).toBeTruthy();
  });
});
