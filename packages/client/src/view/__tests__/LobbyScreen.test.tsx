import { render, screen, fireEvent, act } from '@testing-library/react';
import { InvalidUsernameError, Team } from '@arena/shared';
import { LobbyView, LobbyScreen } from '../LobbyView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { LobbyController } from '../../controller/LobbyController';

function makeMockController(identity: ClientIdentityModel): LobbyController & { operation: jest.Mock } {
  const operation = jest.fn((action: string, payload?: { username: string }) => {
    if (action === 'submitUsername') {
      const username = payload?.username ?? '';
      if (username.trim().length === 0 || username.length > 24) {
        throw new InvalidUsernameError(username);
      }
      identity.identify(username);
    }
  });
  return { operation } as unknown as LobbyController & { operation: jest.Mock };
}

describe('LobbyScreen', () => {
  describe('before identification', () => {
    it('renders the username form', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeMockController(identity));

      render(<LobbyScreen view={view} />);

      expect(screen.getByLabelText('Username')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    });

    it('submitting a valid username forwards it to the controller', () => {
      const identity = new ClientIdentityModel();
      const controller = makeMockController(identity);
      const view = new LobbyView(identity, new ClientQueueModel(), controller);

      render(<LobbyScreen view={view} />);
      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Raj' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(controller.operation).toHaveBeenCalledWith('submitUsername', { username: 'Raj' });
    });

    it('CRITICAL CHECKPOINT: after a successful submit, re-renders past the form via the real notifyChanged pipeline (no direct outcome assertion by this component)', () => {
      const identity = new ClientIdentityModel();
      const controller = makeMockController(identity);
      const view = new LobbyView(identity, new ClientQueueModel(), controller);

      render(<LobbyScreen view={view} />);
      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Raj' } });
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      // The screen never decided this itself — it re-rendered only because ClientIdentityModel.identify()
      // called notifyChanged(), LobbyView.modelChanged() ran, and the bound React callback fired.
      expect(screen.getByText('Welcome, Raj')).toBeTruthy();
      expect(screen.queryByLabelText('Username')).toBeNull();
    });

    it('falls back to a generic message when the controller throws a non-Error value', () => {
      const identity = new ClientIdentityModel();
      const controller = { operation: jest.fn(() => { throw 'boom'; }) } as unknown as LobbyController & {
        operation: jest.Mock;
      };
      const view = new LobbyView(identity, new ClientQueueModel(), controller);

      render(<LobbyScreen view={view} />);
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(screen.getByRole('alert').textContent).toMatch(/invalid username/i);
    });

    it('an invalid (empty) username shows an inline validation message and does not advance past the form', () => {
      const identity = new ClientIdentityModel();
      const controller = makeMockController(identity);
      const view = new LobbyView(identity, new ClientQueueModel(), controller);

      render(<LobbyScreen view={view} />);
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(screen.getByRole('alert').textContent).toMatch(/invalid username/i);
      expect(screen.getByLabelText('Username')).toBeTruthy();
    });
  });

  describe('after identification, idle queue', () => {
    it('shows a Find Match control that dispatches joinQueue', () => {
      const identity = new ClientIdentityModel();
      identity.identify('Raj');
      const controller = makeMockController(identity);
      const view = new LobbyView(identity, new ClientQueueModel(), controller);

      render(<LobbyScreen view={view} />);
      fireEvent.click(screen.getByRole('button', { name: 'Find Match' }));

      expect(controller.operation).toHaveBeenCalledWith('joinQueue');
    });
  });

  describe('queued', () => {
    it('shows the queue position and a Cancel control that dispatches cancelQueue', () => {
      const identity = new ClientIdentityModel();
      identity.identify('Raj');
      const queue = new ClientQueueModel();
      queue.setQueued(4);
      const controller = makeMockController(identity);
      const view = new LobbyView(identity, queue, controller);

      render(<LobbyScreen view={view} />);

      expect(screen.getByText(/Position in queue: 4/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(controller.operation).toHaveBeenCalledWith('cancelQueue');
    });

    it('CRITICAL CHECKPOINT: a queue update pushed after mount (simulating an inbound server event) re-renders without remounting', () => {
      const identity = new ClientIdentityModel();
      identity.identify('Raj');
      const queue = new ClientQueueModel();
      const controller = makeMockController(identity);
      const view = new LobbyView(identity, queue, controller);

      render(<LobbyScreen view={view} />);
      expect(screen.getByRole('button', { name: 'Find Match' })).toBeTruthy();

      act(() => {
        queue.setQueued(1);
      });

      expect(screen.getByText(/Position in queue: 1/)).toBeTruthy();
    });
  });

  describe('matched', () => {
    it('shows the opponent username once matched', () => {
      const identity = new ClientIdentityModel();
      identity.identify('Raj');
      const queue = new ClientQueueModel();
      queue.setMatched({ matchId: 'm1', team: Team.A, opponentUsername: 'Bob', roster: [] });
      const controller = makeMockController(identity);
      const view = new LobbyView(identity, queue, controller);

      render(<LobbyScreen view={view} />);

      expect(screen.getByText(/Match found! Opponent: Bob/)).toBeTruthy();
    });
  });
});
