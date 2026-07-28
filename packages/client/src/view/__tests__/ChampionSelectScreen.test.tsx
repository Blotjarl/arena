import { render, screen, fireEvent, act } from '@testing-library/react';
import { Team, Champion, Ability, EffectType } from '@arena/shared';
import { ChampionSelectView, ChampionSelectScreen } from '../ChampionSelectView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { ChampionSelectController } from '../../controller/ChampionSelectController';

function makeRoster(): Champion[] {
  return [
    new Champion('vex', 'Vex', 'Ranged Burst Mage', 85, 100, 10, 200, [
      new Ability('bolt', 'Arcane Bolt', 5, 20, 500, EffectType.DAMAGE, 30),
    ]),
    new Champion('korr', 'Korr', 'Bruiser / Control', 180, 100, 8, 150, [
      new Ability('crush', 'Crushing Blow', 3, 15, 80, EffectType.DAMAGE, 25),
    ]),
  ];
}

function makeQueueWithRoster(): ClientQueueModel {
  const queue = new ClientQueueModel();
  queue.setMatched({ matchId: 'm1', team: Team.A, opponentUsername: 'Bob', roster: makeRoster() });
  return queue;
}

function makeMockController(): ChampionSelectController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as ChampionSelectController & { operation: jest.Mock };
}

describe('ChampionSelectScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders both players and the roster with names, roles, and abilities', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    const view = new ChampionSelectView(identity, new ClientMatchModel(), makeQueueWithRoster(), makeMockController());

    render(<ChampionSelectScreen view={view} />);

    expect(screen.getByText(/You: Raj/)).toBeTruthy();
    expect(screen.getByText(/Opponent: Bob/)).toBeTruthy();
    expect(screen.getByText(/Vex — Ranged Burst Mage/)).toBeTruthy();
    expect(screen.getByText(/Korr — Bruiser \/ Control/)).toBeTruthy();
    expect(screen.getByText('Arcane Bolt')).toBeTruthy();
    expect(screen.getByText('Crushing Blow')).toBeTruthy();
  });

  it('clicking Select forwards selectChampion with the chosen championId', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    const controller = makeMockController();
    const view = new ChampionSelectView(identity, new ClientMatchModel(), makeQueueWithRoster(), controller);

    render(<ChampionSelectScreen view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Vex' }));

    expect(controller.operation).toHaveBeenCalledWith('selectChampion', { championId: 'vex' });
  });

  it('CRITICAL CHECKPOINT: shows my own selection (matched on playerId) and disables further selection, via the real notifyChanged pipeline', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    const controller = makeMockController();
    const view = new ChampionSelectView(identity, match, makeQueueWithRoster(), controller);

    render(<ChampionSelectScreen view={view} />);
    expect(screen.queryByText(/You selected/)).toBeNull();

    act(() => {
      match.applyChampionSelected({ matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: false });
    });

    expect(screen.getByText(/You selected: vex/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select Vex' })).toHaveProperty('disabled', true);
  });

  it('does not treat the opponent selecting as "my" selection', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    match.applyChampionSelected({ matchId: 'm1', playerId: 'p2', championId: 'korr', bothSelected: false });
    const view = new ChampionSelectView(identity, match, makeQueueWithRoster(), makeMockController());

    render(<ChampionSelectScreen view={view} />);

    expect(screen.queryByText(/You selected/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Select Vex' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows "Both players ready" once bothSelected is true', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    match.applyChampionSelected({ matchId: 'm1', playerId: 'p1', championId: 'vex', bothSelected: true });
    const view = new ChampionSelectView(identity, match, makeQueueWithRoster(), makeMockController());

    render(<ChampionSelectScreen view={view} />);

    expect(screen.getByText('Both players ready')).toBeTruthy();
  });

  it('CRITICAL CHECKPOINT: the local countdown ticks down once per second and never goes below zero', () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    const view = new ChampionSelectView(identity, new ClientMatchModel(), makeQueueWithRoster(), makeMockController());

    render(<ChampionSelectScreen view={view} />);
    expect(screen.getByText('Selection window: 30s')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Selection window: 25s')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(screen.getByText('Selection window: 0s')).toBeTruthy();
  });
});
