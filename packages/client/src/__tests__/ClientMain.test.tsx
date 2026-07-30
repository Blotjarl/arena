import { act, fireEvent } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { ClientMain } from '../ClientMain';

function makeFakeSocket() {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const socket = {
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: jest.fn(),
    connect: jest.fn(),
  };
  return { socket: socket as unknown as Socket, handlers };
}

describe('ClientMain.main', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('mounts the full model/controller/view graph without throwing, given a mock socket', () => {
    const { socket } = makeFakeSocket();
    expect(() => {
      act(() => {
        ClientMain.main(() => socket);
      });
    }).not.toThrow();
  });

  it('renders the Lobby screen (identify form) before identification', () => {
    const { socket } = makeFakeSocket();
    act(() => {
      ClientMain.main(() => socket);
    });
    const root = document.getElementById('root');
    expect(root?.innerHTML).not.toBe('');
    expect(root?.querySelector('form[aria-label="identify-form"]')).not.toBeNull();
  });

  it('throws a clear error rather than a cryptic DOM failure when #root is missing', () => {
    document.body.innerHTML = '';
    const { socket } = makeFakeSocket();
    expect(() => {
      act(() => {
        ClientMain.main(() => socket);
      });
    }).toThrow(/#root/);
  });

  it('never opens a real socket connection itself — only calls the injected factory, exactly once', () => {
    const { socket } = makeFakeSocket();
    const factory = jest.fn(() => socket);
    act(() => {
      ClientMain.main(factory);
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('CRITICAL CHECKPOINT: identifying via the UI then receiving match:found routes from Lobby to Champion Select, through the real wiring end to end', () => {
    const { socket, handlers } = makeFakeSocket();
    act(() => {
      ClientMain.main(() => socket);
    });
    const root = document.getElementById('root')!;

    // Drive identification the way a real user would: through the rendered form, LobbyController,
    // and SocketConnectionController — not by reaching into private model instances (main() exposes
    // none), since ClientMain's whole job is wiring these together, not just constructing them.
    act(() => {
      fireEvent.change(root.querySelector('#username')!, { target: { value: 'Raj' } });
      fireEvent.click(root.querySelector('button[type="submit"]')!);
    });
    expect(root.querySelector('form[aria-label="identify-form"]')).toBeNull();

    act(() => {
      handlers.get('match:found')!({ matchId: 'm1', team: 'A', opponentUsername: 'Bob', roster: [] });
    });

    expect(root.querySelector('ul[aria-label="champion-roster"]')).not.toBeNull();
  });

  it('CRITICAL CHECKPOINT (regression): after a match ends, a second match:found routes back to a usable Champion Select screen, not a stuck Results screen', () => {
    const { socket, handlers } = makeFakeSocket();
    act(() => {
      ClientMain.main(() => socket);
    });
    const root = document.getElementById('root')!;

    act(() => {
      fireEvent.change(root.querySelector('#username')!, { target: { value: 'Raj' } });
      fireEvent.click(root.querySelector('button[type="submit"]')!);
    });
    // LobbyController persists the generated client-session playerId here (see its 'submitUsername'
    // handling) — read it back so the champion:selected payload below can genuinely match "this
    // connection's own selection" the same way a real server broadcast would, rather than a
    // wrong/foreign playerId that would trivially (and incorrectly) pass this regression's check.
    const myPlayerId = sessionStorage.getItem('arena:playerId')!;
    const roster = [{ id: 'korr', name: 'Korr', role: 'Bruiser', maxHealth: 180, abilities: [] }];
    act(() => {
      handlers.get('match:found')!({ matchId: 'm1', team: 'A', opponentUsername: 'Bob', roster });
    });
    act(() => {
      handlers.get('champion:selected')!({ matchId: 'm1', playerId: myPlayerId, championId: 'korr', bothSelected: false });
    });
    act(() => {
      handlers.get('match:end')!({ matchId: 'm1', reason: 'elimination', winningTeam: 'A', durationMs: 1000 });
    });
    // Confirms the precondition this regression guards against actually exists before the fix is
    // exercised: the Results screen (not Champion Select) is showing after the first match ends.
    expect(root.querySelector('.screen-results')).not.toBeNull();

    // A second match:found — e.g. after clicking "Return to Queue" and being paired again.
    act(() => {
      handlers.get('match:found')!({ matchId: 'm2', team: 'B', opponentUsername: 'Carol', roster });
    });

    // Without the fix, the stale `result` from match 1 keeps AppRouter on ResultsScreen forever.
    expect(root.querySelector('.screen-results')).toBeNull();
    const championRoster = root.querySelector('ul[aria-label="champion-roster"]');
    expect(championRoster).not.toBeNull();
    // Without the fix, the stale `championSelection` from match 1 pre-disables every select button.
    const selectButtons = root.querySelectorAll('.btn-select');
    expect(selectButtons.length).toBeGreaterThan(0);
    selectButtons.forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('ClientMain.main — socket reconnection (R6.1–R6.4 client-side gap)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('does not emit identify or match:reconnect on the very first, pre-login connect', () => {
    const { socket, handlers } = makeFakeSocket();
    act(() => {
      ClientMain.main(() => socket);
    });

    act(() => {
      handlers.get('connect')!();
    });

    expect(socket.emit).not.toHaveBeenCalledWith('identify', expect.anything());
    expect(socket.emit).not.toHaveBeenCalledWith('match:reconnect', expect.anything());
  });

  it('re-emits identify (but not match:reconnect) on reconnect after identifying, with no active match', () => {
    const { socket, handlers } = makeFakeSocket();
    act(() => {
      ClientMain.main(() => socket);
    });
    const root = document.getElementById('root')!;

    act(() => {
      fireEvent.change(root.querySelector('#username')!, { target: { value: 'Raj' } });
      fireEvent.click(root.querySelector('button[type="submit"]')!);
    });
    (socket.emit as jest.Mock).mockClear();

    act(() => {
      handlers.get('connect')!();
    });

    expect(socket.emit).toHaveBeenCalledWith('identify', expect.objectContaining({ username: 'Raj' }));
    expect(socket.emit).not.toHaveBeenCalledWith('match:reconnect', expect.anything());
  });

  it('CRITICAL CHECKPOINT: reconnect after identifying with an active, non-ended match emits identify then match:reconnect, in that order', () => {
    const { socket, handlers } = makeFakeSocket();
    act(() => {
      ClientMain.main(() => socket);
    });
    const root = document.getElementById('root')!;

    act(() => {
      fireEvent.change(root.querySelector('#username')!, { target: { value: 'Raj' } });
      fireEvent.click(root.querySelector('button[type="submit"]')!);
    });
    act(() => {
      handlers.get('match:start')!({
        matchId: 'm1',
        initialState: {
          matchId: 'm1',
          tick: 0,
          participants: [
            {
              playerId: 'p1',
              team: 'A',
              championId: 'korr',
              position: { x: 0, y: 0 },
              health: 100,
              resource: 0,
              cooldownsRemaining: {},
              crowdControlled: false,
              connectionStatus: 'connected',
              alive: true,
            },
            {
              playerId: 'p2',
              team: 'B',
              championId: 'vex',
              position: { x: 1, y: 1 },
              health: 100,
              resource: 0,
              cooldownsRemaining: {},
              crowdControlled: false,
              connectionStatus: 'connected',
              alive: true,
            },
          ],
        },
      });
    });
    (socket.emit as jest.Mock).mockClear();

    act(() => {
      handlers.get('connect')!();
    });

    const emittedEvents = (socket.emit as jest.Mock).mock.calls.map(([event]) => event);
    const identifyIndex = emittedEvents.indexOf('identify');
    const reconnectIndex = emittedEvents.indexOf('match:reconnect');
    expect(identifyIndex).not.toBe(-1);
    expect(reconnectIndex).not.toBe(-1);
    expect(identifyIndex).toBeLessThan(reconnectIndex);
  });
});
