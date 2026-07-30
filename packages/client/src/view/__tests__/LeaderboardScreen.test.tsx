import { render, screen, fireEvent, act } from '@testing-library/react';
import { LeaderboardView, LeaderboardScreen } from '../LeaderboardView';
import { ClientLeaderboardModel } from '../../model/ClientLeaderboardModel';
import type { LeaderboardController } from '../../controller/LeaderboardController';

function makeMockController(): LeaderboardController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as LeaderboardController & { operation: jest.Mock };
}

describe('LeaderboardScreen', () => {
  it('CRITICAL CHECKPOINT: dispatches refresh on mount, without any user interaction', () => {
    const controller = makeMockController();
    const view = new LeaderboardView(new ClientLeaderboardModel(), controller);

    render(<LeaderboardScreen view={view} onBack={jest.fn()} />);

    expect(controller.operation).toHaveBeenCalledWith('refresh');
  });

  it('shows a loading indicator before the first successful load', () => {
    const model = new ClientLeaderboardModel();
    model.setLoading();
    const view = new LeaderboardView(model, makeMockController());

    render(<LeaderboardScreen view={view} onBack={jest.fn()} />);

    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('shows an error message when the model reports one', () => {
    const model = new ClientLeaderboardModel();
    model.setError('Failed to load leaderboard (HTTP 500/200)');
    const view = new LeaderboardView(model, makeMockController());

    render(<LeaderboardScreen view={view} onBack={jest.fn()} />);

    expect(screen.getByRole('alert').textContent).toMatch(/failed to load leaderboard/i);
  });

  it('shows an empty-state message when the fetch succeeds with no entries', () => {
    const model = new ClientLeaderboardModel();
    model.setLoaded([], []);
    const view = new LeaderboardView(model, makeMockController());

    render(<LeaderboardScreen view={view} onBack={jest.fn()} />);

    expect(screen.getByText(/no games recorded yet/i)).toBeTruthy();
    expect(screen.queryByLabelText('leaderboard-entries')).toBeNull();
  });

  it('CRITICAL CHECKPOINT: renders ranked entries with wins/losses/draws/games/win rate, and champion win rates with resolved names', () => {
    const model = new ClientLeaderboardModel();
    model.setLoaded(
      [
        { username: 'Alice', wins: 3, losses: 1, draws: 0, gamesPlayed: 4, winRate: 0.75 },
        { username: 'Bob', wins: 1, losses: 3, draws: 0, gamesPlayed: 4, winRate: 0.25 },
      ],
      [{ championId: 'vex', gamesPlayed: 10, winRate: 0.5 }],
    );
    const view = new LeaderboardView(model, makeMockController());

    render(<LeaderboardScreen view={view} onBack={jest.fn()} />);

    const entriesList = screen.getByLabelText('leaderboard-entries');
    expect(entriesList.textContent).toContain('Alice');
    expect(entriesList.textContent).toContain('3W');
    expect(entriesList.textContent).toContain('1L');
    expect(entriesList.textContent).toContain('75.0%'); // 0.75 -> 75.0%, not 0.75% or 7500%
    expect(entriesList.textContent).toContain('Bob');
    expect(entriesList.textContent).toContain('25.0%');

    const championList = screen.getByLabelText('champion-win-rates');
    // Champion id 'vex' resolved to its real display name, not the raw id.
    expect(championList.textContent).toContain('Vex');
    expect(championList.textContent).not.toContain('vex');
    expect(championList.textContent).toContain('50.0%');
  });

  it('the Refresh button re-dispatches refresh', () => {
    const model = new ClientLeaderboardModel();
    model.setLoaded([{ username: 'Alice', wins: 1, losses: 0, draws: 0, gamesPlayed: 1, winRate: 1 }], []);
    const controller = makeMockController();
    const view = new LeaderboardView(model, controller);

    render(<LeaderboardScreen view={view} onBack={jest.fn()} />);
    controller.operation.mockClear(); // clear the mount-triggered call
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(controller.operation).toHaveBeenCalledWith('refresh');
  });

  it('the Back button calls onBack', () => {
    const model = new ClientLeaderboardModel();
    const onBack = jest.fn();
    const view = new LeaderboardView(model, makeMockController());

    render(<LeaderboardScreen view={view} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL CHECKPOINT: a model update pushed after mount (simulating the real refresh completing) re-renders without remounting', () => {
    const model = new ClientLeaderboardModel();
    const view = new LeaderboardView(model, makeMockController());

    render(<LeaderboardScreen view={view} onBack={jest.fn()} />);
    expect(screen.queryByLabelText('leaderboard-entries')).toBeNull();

    act(() => {
      model.setLoaded([{ username: 'Alice', wins: 1, losses: 0, draws: 0, gamesPlayed: 1, winRate: 1 }], []);
    });

    expect(screen.getByLabelText('leaderboard-entries').textContent).toContain('Alice');
  });

  it('a failed refresh after a previous success keeps showing the previously-loaded entries alongside the error', () => {
    const model = new ClientLeaderboardModel();
    model.setLoaded([{ username: 'Alice', wins: 1, losses: 0, draws: 0, gamesPlayed: 1, winRate: 1 }], []);
    const view = new LeaderboardView(model, makeMockController());

    render(<LeaderboardScreen view={view} onBack={jest.fn()} />);

    act(() => {
      model.setLoading();
      model.setError('network down');
    });

    expect(screen.getByLabelText('leaderboard-entries').textContent).toContain('Alice');
    expect(screen.getByRole('alert').textContent).toMatch(/network down/i);
  });
});
