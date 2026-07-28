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
});
