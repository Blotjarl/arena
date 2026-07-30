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

/** Same shape as ClientMain.test.tsx's fake socket — captures handlers registered via on(). */
function makeFakeSocket() {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const socket = {
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers.set(event, handler);
    }),
    emit: jest.fn(),
  };
  return { socket, handlers };
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

  it('clicking a self-targeted HEAL ability forwards useAbility immediately, with no target and no aiming', () => {
    const identity = new ClientIdentityModel();
    identity.playerId = 'p1';
    const controller = makeMockController();
    const match = new ClientMatchModel();
    match.applyMatchState({
      matchId: 'm1',
      tick: 1,
      participants: [makeParticipant('p1', { championId: 'rin' }), makeParticipant('p2')],
    });
    const view = new MatchHUDView(identity, match, controller);

    render(<MatchHUDScreen view={view} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vital Siphon' }));

    expect(controller.operation).toHaveBeenCalledWith('useAbility', { abilityId: 'vital-siphon' });
  });

  describe('skillshot aim-then-click (11_cross_1: DAMAGE/CROWD_CONTROL/POSITIONING all require aiming)', () => {
    /** computeArenaRenderSizePx() reads window size once at mount — fix it to a known, round value so
     *  the click -> arena-space math below is exactly hand-verifiable, not dependent on jsdom's default
     *  viewport. Restored after each test so this doesn't bleed into other test files/suites. */
    const ORIGINAL_INNER_WIDTH = window.innerWidth;
    const ORIGINAL_INNER_HEIGHT = window.innerHeight;

    beforeEach(() => {
      // 1200x1200 forces the width-capped branch: min(1200*0.85, 1200*0.85*1.5, 900) = 900 -> height 600.
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 1200, writable: true, configurable: true });
    });

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: ORIGINAL_INNER_WIDTH, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: ORIGINAL_INNER_HEIGHT, writable: true, configurable: true });
    });

    function renderVex(controller: MatchController & { operation: jest.Mock }) {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1', { championId: 'vex' }), makeParticipant('p2')],
      });
      const view = new MatchHUDView(identity, match, controller);
      render(<MatchHUDScreen view={view} />);
    }

    it('clicking a DAMAGE ability does not cast immediately — it enters aim mode', () => {
      const controller = makeMockController();
      renderVex(controller);

      fireEvent.click(screen.getByRole('button', { name: 'Arcane Bolt' }));

      expect(controller.operation).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Arcane Bolt' }).className).toContain('btn-ability--aiming');
    });

    it('CRITICAL CHECKPOINT: clicking an arena point while aiming casts with the real, converted game-space targetPosition', () => {
      const controller = makeMockController();
      renderVex(controller);

      fireEvent.click(screen.getByRole('button', { name: 'Arcane Bolt' }));
      // arenaRenderSizePx is {width:900, height:600} (see beforeEach); jsdom's default
      // getBoundingClientRect is all-zero, so clicking at (450, 300) is exactly the arena's center.
      fireEvent.click(screen.getByLabelText('arena'), { clientX: 450, clientY: 300 });

      expect(controller.operation).toHaveBeenCalledWith('useAbility', {
        abilityId: 'arcane-bolt',
        targetPosition: { x: 360, y: 240 }, // (450/900)*720, (300/600)*480 -- the arena's real center
      });
    });

    it('a POSITIONING ability also requires aiming now (fixes the pre-existing no-op bug end to end)', () => {
      const controller = makeMockController();
      renderVex(controller);

      fireEvent.click(screen.getByRole('button', { name: 'Phase Step' }));
      expect(controller.operation).not.toHaveBeenCalled();

      fireEvent.click(screen.getByLabelText('arena'), { clientX: 900, clientY: 0 });
      expect(controller.operation).toHaveBeenCalledWith('useAbility', {
        abilityId: 'phase-step',
        targetPosition: { x: 720, y: 0 },
      });
    });

    it('clicking the same ability again while already aiming it cancels aim mode (no cast on a later arena click)', () => {
      const controller = makeMockController();
      renderVex(controller);

      fireEvent.click(screen.getByRole('button', { name: 'Arcane Bolt' }));
      fireEvent.click(screen.getByRole('button', { name: 'Arcane Bolt' })); // toggle off
      expect(screen.getByRole('button', { name: 'Arcane Bolt' }).className).not.toContain('btn-ability--aiming');

      fireEvent.click(screen.getByLabelText('arena'), { clientX: 450, clientY: 300 });
      expect(controller.operation).not.toHaveBeenCalled();
    });

    it('clicking a different ability while aiming switches aim to the new one (silently cancels the old aim)', () => {
      const controller = makeMockController();
      renderVex(controller);

      fireEvent.click(screen.getByRole('button', { name: 'Arcane Bolt' }));
      fireEvent.click(screen.getByRole('button', { name: 'Frost Lance' }));
      expect(screen.getByRole('button', { name: 'Arcane Bolt' }).className).not.toContain('btn-ability--aiming');
      expect(screen.getByRole('button', { name: 'Frost Lance' }).className).toContain('btn-ability--aiming');

      fireEvent.click(screen.getByLabelText('arena'), { clientX: 450, clientY: 300 });
      expect(controller.operation).toHaveBeenCalledWith(
        'useAbility',
        expect.objectContaining({ abilityId: 'frost-lance' }),
      );
      expect(controller.operation).not.toHaveBeenCalledWith(
        'useAbility',
        expect.objectContaining({ abilityId: 'arcane-bolt' }),
      );
    });

    it('pressing Escape while aiming cancels aim mode', () => {
      const controller = makeMockController();
      renderVex(controller);

      fireEvent.click(screen.getByRole('button', { name: 'Arcane Bolt' }));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByRole('button', { name: 'Arcane Bolt' }).className).not.toContain('btn-ability--aiming');

      fireEvent.click(screen.getByLabelText('arena'), { clientX: 450, clientY: 300 });
      expect(controller.operation).not.toHaveBeenCalled();
    });

    it('clicking the arena while nothing is being aimed does nothing', () => {
      const controller = makeMockController();
      renderVex(controller);

      fireEvent.click(screen.getByLabelText('arena'), { clientX: 450, clientY: 300 });

      expect(controller.operation).not.toHaveBeenCalled();
    });

    it('every ability button exposes its description as a hover tooltip (title attribute)', () => {
      const controller = makeMockController();
      renderVex(controller);

      const button = screen.getByRole('button', { name: 'Arcane Bolt' });
      expect(button.getAttribute('title')).toMatch(/burst/i);
      expect(button.getAttribute('title')?.length).toBeGreaterThan(0);
    });
  });

  describe('per-ability icons (11_client_8 Scope B.1/B.2)', () => {
    function renderChampion(championId: string) {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1', { championId }), makeParticipant('p2')],
      });
      const view = new MatchHUDView(identity, match, makeMockController());
      return render(<MatchHUDScreen view={view} />);
    }

    it('renders visibly distinct icon markup for two different DAMAGE abilities (Crushing Blow vs Rending Strike) — proving per-ability icons exist, not just per-effect-type', () => {
      const { unmount } = renderChampion('korr');
      const crushingBlowIcon = screen.getByRole('button', { name: 'Crushing Blow' }).querySelector('svg.ability-icon');
      const crushingBlowMarkup = crushingBlowIcon?.innerHTML;
      unmount();

      renderChampion('rin');
      const rendingStrikeIcon = screen.getByRole('button', { name: 'Rending Strike' }).querySelector('svg.ability-icon');
      const rendingStrikeMarkup = rendingStrikeIcon?.innerHTML;

      expect(crushingBlowMarkup).toBeTruthy();
      expect(rendingStrikeMarkup).toBeTruthy();
      expect(crushingBlowMarkup).not.toBe(rendingStrikeMarkup);
    });

    it('color-codes each icon by effect type via the ability-icon--* modifier classes (previously present in markup but unstyled)', () => {
      renderChampion('korr');

      const crushingBlow = screen.getByRole('button', { name: 'Crushing Blow' }).querySelector('svg.ability-icon');
      const shockwaveSlam = screen.getByRole('button', { name: 'Shockwave Slam' }).querySelector('svg.ability-icon');
      const ironSkin = screen.getByRole('button', { name: 'Iron Skin' }).querySelector('svg.ability-icon');
      const bulwarkCharge = screen.getByRole('button', { name: 'Bulwark Charge' }).querySelector('svg.ability-icon');

      expect(crushingBlow?.getAttribute('class')).toContain('ability-icon--damage');
      expect(shockwaveSlam?.getAttribute('class')).toContain('ability-icon--cc');
      expect(ironSkin?.getAttribute('class')).toContain('ability-icon--heal');
      expect(bulwarkCharge?.getAttribute('class')).toContain('ability-icon--positioning');
    });
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

  describe('number-key ability hotkeys 1-4 (11_client_4; skillshot toggle 11_cross_1)', () => {
    function renderVexForHotkeys(controller: MatchController & { operation: jest.Mock }) {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1', { championId: 'vex' }), makeParticipant('p2')],
      });
      const view = new MatchHUDView(identity, match, controller);
      render(<MatchHUDScreen view={view} />);
    }

    it('pressing "1" (Arcane Bolt, DAMAGE) toggles aim mode rather than casting directly', () => {
      const controller = makeMockController();
      renderVexForHotkeys(controller);

      fireEvent.keyDown(window, { key: '1' });

      expect(controller.operation).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Arcane Bolt' }).className).toContain('btn-ability--aiming');
    });

    it('pressing the same hotkey again cancels aim mode (toggle off)', () => {
      const controller = makeMockController();
      renderVexForHotkeys(controller);

      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(window, { key: '1' });

      expect(screen.getByRole('button', { name: 'Arcane Bolt' }).className).not.toContain('btn-ability--aiming');
    });

    it('a hotkey for an unmapped slot (no 4th ability on this champion) is a no-op', () => {
      const controller = makeMockController();
      renderVexForHotkeys(controller); // Vex has only 3 abilities

      expect(() => fireEvent.keyDown(window, { key: '4' })).not.toThrow();
      expect(controller.operation).not.toHaveBeenCalled();
    });

    it('pressing the hotkey for a HEAL ability casts immediately, same as clicking it', () => {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const controller = makeMockController();
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1', { championId: 'rin' }), makeParticipant('p2')],
      });
      const view = new MatchHUDView(identity, match, controller);
      render(<MatchHUDScreen view={view} />);

      fireEvent.keyDown(window, { key: '2' }); // Rin's abilities: [rending-strike, vital-siphon, swift-reposition]

      expect(controller.operation).toHaveBeenCalledWith('useAbility', { abilityId: 'vital-siphon' });
    });
  });

  describe('WASD hold-to-move — diagonal merge (11_cross_1)', () => {
    // REGRESSION: previously dispatched one 'move' call per held key, and MatchController's own 50ms
    // throttle silently dropped all but the first within the same tick — holding two keys together
    // never actually moved diagonally, only in whichever direction happened to iterate first.
    function renderMovable(controller: MatchController & { operation: jest.Mock }) {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1'), makeParticipant('p2')],
      });
      const view = new MatchHUDView(identity, match, controller);
      render(<MatchHUDScreen view={view} />);
    }

    function lastMoveCall(controller: { operation: jest.Mock }): { dx: number; dy: number } | undefined {
      const calls = controller.operation.mock.calls.filter(([action]: [string]) => action === 'move');
      return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
    }

    it('CRITICAL CHECKPOINT: holding W then D dispatches a single merged diagonal vector, not just one axis', () => {
      const controller = makeMockController();
      renderMovable(controller);

      fireEvent.keyDown(window, { key: 'w' });
      fireEvent.keyDown(window, { key: 'd' });

      expect(lastMoveCall(controller)).toEqual({ dx: 1, dy: -1 });
    });

    it('releasing one of two held keys returns to the remaining single-axis direction on the next tick', () => {
      jest.useFakeTimers();
      const controller = makeMockController();
      renderMovable(controller);

      fireEvent.keyDown(window, { key: 'w' });
      fireEvent.keyDown(window, { key: 'd' });
      fireEvent.keyUp(window, { key: 'd' });
      controller.operation.mockClear();

      act(() => {
        jest.advanceTimersByTime(50); // MOVE_REPEAT_INTERVAL_MS
      });

      expect(lastMoveCall(controller)).toEqual({ dx: 0, dy: -1 });
      jest.useRealTimers();
    });

    it('opposite keys held together (W+S) cancel to a zero vector — no move is dispatched', () => {
      const controller = makeMockController();
      renderMovable(controller);

      fireEvent.keyDown(window, { key: 'w' });
      controller.operation.mockClear();
      fireEvent.keyDown(window, { key: 's' });

      expect(controller.operation).not.toHaveBeenCalled();
    });
  });

  describe('cast-effect feedback (11_client_4; isMine/recordedAim retargeting 11_cross_1)', () => {
    // These exercise the tick-diff effect that detects "an ability was just used" from a cooldown
    // transition between two consecutive match:state snapshots — previously untested by anything in this
    // file (only manually verified in a real browser per 11_client_4's own process), and now materially
    // more complex after 11_cross_1 added the isMine/recordedAim branching this specifically covers.

    it('CRITICAL CHECKPOINT: my own DAMAGE skillshot spawns a projectile toward my recorded aim point, not blindly toward the opponent', () => {
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
      const { container } = render(<MatchHUDScreen view={view} />);

      // Aim and cast for real, through the actual UI flow, so a real aim point gets recorded.
      fireEvent.click(screen.getByRole('button', { name: 'Arcane Bolt' }));
      fireEvent.click(screen.getByLabelText('arena'), { clientX: 450, clientY: 300 });

      // Simulate the server broadcasting the resulting cooldown transition on the next tick.
      act(() => {
        match.applyMatchState({
          matchId: 'm1',
          tick: 2,
          participants: [
            makeParticipant('p1', { championId: 'vex', cooldownsRemaining: { 'arcane-bolt': 4 } }),
            makeParticipant('p2'),
          ],
        });
      });

      const effect = container.querySelector('.cast-effect--projectile.cast-effect--mine') as HTMLElement | null;
      expect(effect).not.toBeNull();
      // aimed at the arena's center (game units 360,240, per the click -> arena-space math verified
      // elsewhere in this file) -- from p1's own rendered position (10,20, from makeParticipant).
      expect(effect!.style.getPropertyValue('--dx')).not.toBe('0px');
    });

    it('a POSITIONING skillshot also spawns a projectile-style effect (previously bucketed as a self-pulse, before it was a real aimed ability)', () => {
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
      const { container } = render(<MatchHUDScreen view={view} />);

      fireEvent.click(screen.getByRole('button', { name: 'Phase Step' }));
      fireEvent.click(screen.getByLabelText('arena'), { clientX: 900, clientY: 0 });

      act(() => {
        match.applyMatchState({
          matchId: 'm1',
          tick: 2,
          participants: [
            makeParticipant('p1', { championId: 'vex', cooldownsRemaining: { 'phase-step': 9 } }),
            makeParticipant('p2'),
          ],
        });
      });

      expect(container.querySelector('.cast-effect--projectile.cast-effect--mine')).not.toBeNull();
    });

    it("the opponent's cast (no aim info available to this client) still animates toward their real target — this client", () => {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1', { championId: 'vex' }), makeParticipant('p2', { championId: 'vex' })],
      });
      const view = new MatchHUDView(identity, match, makeMockController());
      const { container } = render(<MatchHUDScreen view={view} />);

      act(() => {
        match.applyMatchState({
          matchId: 'm1',
          tick: 2,
          participants: [
            makeParticipant('p1', { championId: 'vex' }),
            makeParticipant('p2', { championId: 'vex', cooldownsRemaining: { 'arcane-bolt': 4 } }),
          ],
        });
      });

      const effect = container.querySelector(
        '.cast-effect--projectile:not(.cast-effect--mine)',
      ) as HTMLElement | null;
      expect(effect).not.toBeNull();
    });

    it("a HEAL cast still animates as a self-pulse at the caster's own position, not a projectile", () => {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1', { championId: 'rin' }), makeParticipant('p2')],
      });
      const view = new MatchHUDView(identity, match, makeMockController());
      const { container } = render(<MatchHUDScreen view={view} />);

      act(() => {
        match.applyMatchState({
          matchId: 'm1',
          tick: 2,
          participants: [
            makeParticipant('p1', { championId: 'rin', cooldownsRemaining: { 'vital-siphon': 9 } }),
            makeParticipant('p2'),
          ],
        });
      });

      expect(container.querySelector('.cast-effect--pulse.cast-effect--mine')).not.toBeNull();
      expect(container.querySelector('.cast-effect--projectile')).toBeNull();
    });

    it('a health drop between two snapshots spawns a floating damage-number popup', () => {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1', { health: 85 }), makeParticipant('p2')],
      });
      const view = new MatchHUDView(identity, match, makeMockController());
      const { container } = render(<MatchHUDScreen view={view} />);

      act(() => {
        match.applyMatchState({
          matchId: 'm1',
          tick: 2,
          participants: [makeParticipant('p1', { health: 55 }), makeParticipant('p2')],
        });
      });

      const popup = container.querySelector('.damage-popup');
      expect(popup).not.toBeNull();
      expect(popup!.textContent).toBe('-30');
    });
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

  describe('opponent disconnect banner (R6.1-R6.4)', () => {
    it('shows a disconnect banner naming the grace period once match:player_disconnected arrives, and clears it on match:player_reconnected', () => {
      const identity = new ClientIdentityModel();
      identity.playerId = 'p1';
      const match = new ClientMatchModel();
      match.applyMatchState({
        matchId: 'm1',
        tick: 1,
        participants: [makeParticipant('p1'), makeParticipant('p2')],
      });
      const { socket, handlers } = makeFakeSocket();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = new MatchHUDView(identity, match, makeMockController(), socket as any);

      render(<MatchHUDScreen view={view} />);
      expect(screen.queryByLabelText('disconnect-banner')).toBeNull();

      act(() => {
        handlers.get('match:player_disconnected')!({ playerId: 'p2', gracePeriodSeconds: 30 });
      });

      expect(screen.getByLabelText('disconnect-banner').textContent).toMatch(/30/);

      act(() => {
        handlers.get('match:player_reconnected')!({ playerId: 'p2' });
      });

      expect(screen.queryByLabelText('disconnect-banner')).toBeNull();
    });
  });
});
