import { render, screen, fireEvent, act } from '@testing-library/react';
import { Team, ConnectionStatus, ParticipantSnapshot, Position } from '@arena/shared';
import { MatchHUDView, MatchHUDScreen } from '../MatchHUDView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import type { MatchController } from '../../controller/MatchController';

function makeParticipant(playerId: string, overrides: Partial<ParticipantSnapshot> = {}): ParticipantSnapshot {
  return {
    playerId,
    team: Team.A,
    championId: 'vex',
    position: new Position(10, 20),
    health: 85,
    resource: 40,
    cooldownsRemaining: {},
    crowdControlled: false,
    connectionStatus: ConnectionStatus.CONNECTED,
    alive: true,
    ...overrides,
  };
}

function makeMockController(): MatchController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as MatchController & { operation: jest.Mock };
}

describe('MatchHUDScreen', () => {
  it('shows a waiting message before the first match:state snapshot arrives', () => {
    const view = new MatchHUDView(new ClientIdentityModel(), new ClientMatchModel(), makeMockController());
    render(<MatchHUDScreen view={view} />);
    expect(screen.getByText(/Waiting for match state/)).toBeTruthy();
  });

  it("renders my own and the opponent's health/resource once a snapshot is present, correctly split by playerId", () => {
    const identity = new ClientIdentityModel();
    identity.identify('Raj');
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    match.applyMatchState({
      matchId: 'm1',
      tick: 1,
      participants: [
        makeParticipant('p1', { health: 60, resource: 30 }),
        makeParticipant('p2', { health: 85, resource: 100 }),
      ],
    });
    const view = new MatchHUDView(identity, match, makeMockController());

    render(<MatchHUDScreen view={view} />);

    expect(screen.getByText(/You: HP 60 \/ Resource 30/)).toBeTruthy();
    expect(screen.getByText(/Opponent: HP 85 \/ Resource 100/)).toBeTruthy();
  });

  it('correctly identifies "me" when my playerId is the second participant in the tuple', () => {
    const identity = new ClientIdentityModel();
    identity.playerId = 'p2';
    const match = new ClientMatchModel();
    match.applyMatchState({
      matchId: 'm1',
      tick: 1,
      participants: [
        makeParticipant('p1', { health: 85, resource: 100 }),
        makeParticipant('p2', { health: 60, resource: 30 }),
      ],
    });
    const view = new MatchHUDView(identity, match, makeMockController());

    render(<MatchHUDScreen view={view} />);

    expect(screen.getByText(/You: HP 60 \/ Resource 30/)).toBeTruthy();
    expect(screen.getByText(/Opponent: HP 85 \/ Resource 100/)).toBeTruthy();
  });

  it('lists my remaining cooldowns', () => {
    const identity = new ClientIdentityModel();
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    match.applyMatchState({
      matchId: 'm1',
      tick: 1,
      participants: [
        makeParticipant('p1', { cooldownsRemaining: { 'arcane-bolt': 2.3 } }),
        makeParticipant('p2'),
      ],
    });
    const view = new MatchHUDView(identity, match, makeMockController());

    render(<MatchHUDScreen view={view} />);

    expect(screen.getByText('arcane-bolt: 2.3s')).toBeTruthy();
  });

  it('renders one ability button per ability of my selected champion, and clicking forwards useAbility', () => {
    const identity = new ClientIdentityModel();
    identity.playerId = 'p1';
    const controller = makeMockController();
    const match = new ClientMatchModel();
    match.applyMatchState({
      matchId: 'm1',
      tick: 1,
      participants: [makeParticipant('p1', { championId: 'vex' }), makeParticipant('p2')],
    });
    const view = new MatchHUDView(identity, match, controller);

    render(<MatchHUDScreen view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Arcane Bolt' }));

    expect(controller.operation).toHaveBeenCalledWith('useAbility', { abilityId: 'arcane-bolt' });
  });

  it('movement buttons forward move with the corresponding direction', () => {
    const identity = new ClientIdentityModel();
    identity.playerId = 'p1';
    const controller = makeMockController();
    const match = new ClientMatchModel();
    match.applyMatchState({
      matchId: 'm1',
      tick: 1,
      participants: [makeParticipant('p1'), makeParticipant('p2')],
    });
    const view = new MatchHUDView(identity, match, controller);

    render(<MatchHUDScreen view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Up' }));

    expect(controller.operation).toHaveBeenCalledWith('move', { dx: 0, dy: -1 });
  });

  it('CRITICAL CHECKPOINT: a match:state update pushed after mount re-renders in place via the real notifyChanged pipeline', () => {
    const identity = new ClientIdentityModel();
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    const view = new MatchHUDView(identity, match, makeMockController());

    render(<MatchHUDScreen view={view} />);
    expect(screen.getByText(/Waiting for match state/)).toBeTruthy();

    act(() => {
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1', { health: 77 }), makeParticipant('p2')],
      });
    });

    expect(screen.getByText(/You: HP 77/)).toBeTruthy();
  });

  it('CRITICAL: never writes an interpolated position back onto ClientMatchModel (rendering-only, master context §8)', () => {
    const identity = new ClientIdentityModel();
    identity.playerId = 'p1';
    const match = new ClientMatchModel();
    const snapshot = {
      matchId: 'm1',
      tick: 1,
      participants: [makeParticipant('p1'), makeParticipant('p2')] as [ParticipantSnapshot, ParticipantSnapshot],
    };
    match.applyMatchState(snapshot);
    const view = new MatchHUDView(identity, match, makeMockController());

    render(<MatchHUDScreen view={view} />);

    expect(match.latestState).toBe(snapshot);
    expect(match.latestState!.participants[0].position).toEqual(new Position(10, 20));
  });
});
