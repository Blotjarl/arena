# Prompt 10_client_7 — MatchHUDView + MatchHUDScreen Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_client_4` (`MatchController`) and `10_client_6` (`ChampionSelectView`, which lands the
`ClientMatchModel.notifyChanged` correction all four `apply*` methods need) must both be merged first.
**Do not repeat that correction here** — `10_client_6` already applied it to all four methods; this prompt
only depends on `applyMatchState`'s half of it.

### CRITICAL: master context §1.1 and the InterpolationBuffer checkpoint (master context §8)
This screen renders exactly what `ClientMatchModel.latestState` holds — health, resource, cooldowns, and
position all come from the server's `match:state` broadcasts. The one piece of client-side computation is
`InterpolationBuffer`'s smoothed between-tick position, which exists **purely for rendering** and must never
be written back into `ClientMatchModel` — this is one of the six named critical-checkpoint areas in master
context §8 ("`InterpolationBuffer.getInterpolatedPosition` must only ever produce a `Position` for
rendering — verified by a test asserting it never mutates `ClientMatchModel`"). This prompt's own test suite
includes that exact checkpoint at the `MatchHUDScreen` level, not just inside `InterpolationBuffer`'s own
unit tests (`09_client_3`) — rendering this screen must not alter `match.latestState` in any way.

---

### Design notes

**Two models again, for the same reason as the other views in this batch.** Telling "you" apart from "the
opponent" in the two-participant tuple (`MatchStatePayload.participants: [ParticipantSnapshot,
ParticipantSnapshot]`) needs this connection's own `playerId`, which `ClientMatchModel` doesn't carry.
`getModel()`/`setModel()` still resolve to `ClientMatchModel`, matching `MatchController`'s
`AbstractController<ClientMatchModel, MatchHUDView>` pairing; `ClientIdentityModel` is reachable via a
`getIdentityModel()` accessor outside the formal `View<M,C>` contract — same pattern as `LobbyView` and
`ChampionSelectView`. Unlike those two, `MatchHUDView` only registers as a listener on `ClientMatchModel` —
identity doesn't change mid-match, so there's nothing to observe there.

**Ability buttons come from `ChampionRoster`, not from anything carried on the snapshot.**
`ParticipantSnapshot` only has `championId`, not the full `Champion`/`Ability[]` shape — but per master
context §2.2's design note on `ChampionRoster`'s placement, that data is synchronously available client-side
with no network round trip (`ChampionRoster.getById(me.championId)`), the same way the server resolves it.
This is not a violation of "the client renders what the server sends" — the champion roster itself is fixed,
version-controlled content shared by both sides, not something the server computes live per match.

**`InterpolationBuffer.push` is called from `modelChanged`, gated on `event.type === 'matchState'`.**
`ClientMatchModel` also fires `'championSelection:changed'`/`'matchStart'`/`'matchEnd'` events (from the
other three `apply*` methods) — none of those carry a `MatchStatePayload`, so pushing them into the buffer
would be a type error at best and silently wrong data at worst. Only `'matchState'` (the event type
`applyMatchState` fires, per `10_client_6`'s correction) triggers a push; every event type still triggers a
re-render via the bound callback, since any of them could mean something on-screen changed.

---

### 1. Replace `packages/client/src/view/MatchHUDView.tsx` with:

```tsx
import { useEffect, useReducer } from 'react';
import { View, ModelListener, ModelEvent, ChampionRoster, MatchStatePayload } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { MatchController } from '../controller/MatchController';
import { InterpolationBuffer } from '../model/InterpolationBuffer';

/** Directional presets for the movement controls, in dx/dy form (R4.1). */
const MOVE_DIRECTIONS: Record<string, { dx: number; dy: number }> = {
  Up: { dx: 0, dy: -1 },
  Down: { dx: 0, dy: 1 },
  Left: { dx: -1, dy: 0 },
  Right: { dx: 1, dy: 0 },
};

/**
 * MVC View for the in-combat HUD screen. Observes ClientMatchModel for authoritative tick
 * snapshots and uses InterpolationBuffer for smooth between-tick rendering (R4.7, R-P4).
 * Player input is forwarded to MatchController (SRS 3.1.1, R4.1–R4.7).
 */
export class MatchHUDView implements View, ModelListener {
  /** Callback registered by MatchHUDScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * Rendering-only interpolation buffer; capacity of 10 retains ~500ms of ticks at 20Hz.
   * Positions produced here are never written back to ClientMatchModel.
   */
  private readonly interpolation = new InterpolationBuffer(10);

  /**
   * CORRECTION (Step 10): same pattern as LobbyView/ChampionSelectView — distinguishing "you" from
   * "the opponent" in the HUD needs this connection's own playerId, which ClientMatchModel does not
   * carry. getModel()/setModel() still resolve to ClientMatchModel, matching MatchController's
   * `AbstractController<ClientMatchModel, MatchHUDView>` pairing; ClientIdentityModel is reachable via
   * a separate getIdentityModel() accessor, outside the formal View<M,C> contract.
   * @param identityModel - supplies this connection's own playerId, to tell "you" apart from the opponent
   * @param model - the match model this view observes for authoritative combat state
   * @param controller - the controller this view forwards player input through
   */
  constructor(
    private identityModel: ClientIdentityModel,
    private model: ClientMatchModel,
    private controller: MatchController,
  ) {
    this.model.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * @param callback - called with no arguments whenever the model changes
   */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Returns the observed match model.
   * @returns the current ClientMatchModel
   */
  getModel(): ClientMatchModel {
    return this.model;
  }

  /**
   * Replaces the observed model reference. Unlike the constructor, this does not re-register the
   * view as a listener on the new model — call `model.addModelListener(this)` separately if needed.
   * @param model - the new ClientMatchModel to observe
   */
  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  /**
   * Returns the observed identity model (CORRECTION, Step 10 — see constructor doc above).
   * @returns the current ClientIdentityModel
   */
  getIdentityModel(): ClientIdentityModel {
    return this.identityModel;
  }

  /**
   * Replaces the observed identity model reference. Does not re-register as a listener.
   * @param identityModel - the new ClientIdentityModel to observe
   */
  setIdentityModel(identityModel: ClientIdentityModel): void {
    this.identityModel = identityModel;
  }

  /**
   * Returns the controller used to forward player input.
   * @returns the current MatchController
   */
  getController(): MatchController {
    return this.controller;
  }

  /**
   * Replaces the controller used to forward player input.
   * @param controller - the new MatchController
   */
  setController(controller: MatchController): void {
    this.controller = controller;
  }

  /**
   * Returns the rendering-only interpolation buffer, for MatchHUDScreen to query render positions
   * from. Never exposed as anything other than read access — nothing outside this view pushes to it.
   * @returns the current InterpolationBuffer
   */
  getInterpolationBuffer(): InterpolationBuffer {
    return this.interpolation;
  }

  /**
   * Called by AbstractModel when the match model fires a change event (i.e. a new tick snapshot
   * has arrived). Feeds the snapshot into the interpolation buffer, then invokes onUpdate.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    if (event.type === 'matchState') {
      this.interpolation.push(event.payload as MatchStatePayload);
    }
    this.onUpdate?.();
  }
}

/** Health/resource bars, cooldown indicators, arena rendering via InterpolationBuffer (SRS 3.1.1). */
export function MatchHUDScreen(props: { view: MatchHUDView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  const identity = view.getIdentityModel();
  const match = view.getModel();
  const controller = view.getController();
  const interpolation = view.getInterpolationBuffer();

  const state = match.latestState;
  if (!state) {
    return <p>Waiting for match state...</p>;
  }

  const [participantA, participantB] = state.participants;
  const me = participantA.playerId === identity.playerId ? participantA : participantB;
  const opponent = participantA.playerId === identity.playerId ? participantB : participantA;
  const myChampion = ChampionRoster.getById(me.championId);

  const now = Date.now();
  const myPosition = interpolation.getInterpolatedPosition(me.playerId, now);
  const opponentPosition = interpolation.getInterpolatedPosition(opponent.playerId, now);

  return (
    <div>
      <div aria-label="you-hud">
        <p>
          You: HP {me.health} / Resource {me.resource}
        </p>
        <ul aria-label="you-cooldowns">
          {Object.entries(me.cooldownsRemaining).map(([abilityId, secondsRemaining]) => (
            <li key={abilityId}>
              {abilityId}: {secondsRemaining.toFixed(1)}s
            </li>
          ))}
        </ul>
      </div>
      <div aria-label="opponent-hud">
        <p>
          Opponent: HP {opponent.health} / Resource {opponent.resource}
        </p>
      </div>
      <div aria-label="arena" style={{ position: 'relative', width: 400, height: 400 }}>
        <div
          aria-label="you-marker"
          style={{ position: 'absolute', left: myPosition.x, top: myPosition.y }}
        />
        <div
          aria-label="opponent-marker"
          style={{ position: 'absolute', left: opponentPosition.x, top: opponentPosition.y }}
        />
      </div>
      <div aria-label="movement-controls">
        {Object.entries(MOVE_DIRECTIONS).map(([label, direction]) => (
          <button key={label} onClick={() => controller.operation('move', direction)}>
            Move {label}
          </button>
        ))}
      </div>
      <div aria-label="ability-controls">
        {myChampion.abilities.map((ability) => (
          <button
            key={ability.id}
            onClick={() => controller.operation('useAbility', { abilityId: ability.id })}
          >
            {ability.name}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### 2. Create `packages/client/src/view/__tests__/MatchHUDView.test.ts` with:

```ts
import { ModelEvent, Team, ConnectionStatus, ParticipantSnapshot, Position } from '@arena/shared';
import { MatchHUDView } from '../MatchHUDView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientMatchModel } from '../../model/ClientMatchModel';
import type { MatchController } from '../../controller/MatchController';

function makeController(): MatchController {
  return { operation: jest.fn() } as unknown as MatchController;
}

function makeParticipant(playerId: string): ParticipantSnapshot {
  return {
    playerId,
    team: Team.A,
    championId: 'vex',
    position: new Position(1, 2),
    health: 85,
    resource: 100,
    cooldownsRemaining: {},
    crowdControlled: false,
    connectionStatus: ConnectionStatus.CONNECTED,
    alive: true,
  };
}

describe('MatchHUDView', () => {
  describe('construction', () => {
    it('registers itself as a listener on the match model only (identity is read-only reference data)', () => {
      const match = new ClientMatchModel();
      const addSpy = jest.spyOn(match, 'addModelListener');

      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());

      expect(addSpy).toHaveBeenCalledWith(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the observed match model', () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      expect(view.getModel()).toBe(match);

      const other = new ClientMatchModel();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('getIdentityModel / setIdentityModel', () => {
    it('returns and replaces the observed identity model', () => {
      const identity = new ClientIdentityModel();
      const view = new MatchHUDView(identity, new ClientMatchModel(), makeController());
      expect(view.getIdentityModel()).toBe(identity);

      const other = new ClientIdentityModel();
      view.setIdentityModel(other);
      expect(view.getIdentityModel()).toBe(other);
    });
  });

  describe('getController / setController', () => {
    it('returns and replaces the controller', () => {
      const controller = makeController();
      const view = new MatchHUDView(new ClientIdentityModel(), new ClientMatchModel(), controller);
      expect(view.getController()).toBe(controller);

      const other = makeController();
      view.setController(other);
      expect(view.getController()).toBe(other);
    });
  });

  describe('getInterpolationBuffer', () => {
    it('returns the same buffer instance across calls', () => {
      const view = new MatchHUDView(new ClientIdentityModel(), new ClientMatchModel(), makeController());
      expect(view.getInterpolationBuffer()).toBe(view.getInterpolationBuffer());
    });
  });

  describe('modelChanged', () => {
    it('invokes the bound update callback for any event', () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      view.modelChanged(new ModelEvent(match, 'championSelection:changed', {}));

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("CRITICAL CHECKPOINT: a 'matchState' event pushes the snapshot into the interpolation buffer", () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      const pushSpy = jest.spyOn(view.getInterpolationBuffer(), 'push');
      const state = { matchId: 'm1', tick: 1, participants: [makeParticipant('p1'), makeParticipant('p2')] as [ParticipantSnapshot, ParticipantSnapshot] };

      view.modelChanged(new ModelEvent(match, 'matchState', state));

      expect(pushSpy).toHaveBeenCalledWith(state);
    });

    it("does not push into the interpolation buffer for a non-'matchState' event", () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      const pushSpy = jest.spyOn(view.getInterpolationBuffer(), 'push');

      view.modelChanged(new ModelEvent(match, 'matchStart', {}));

      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('CRITICAL CHECKPOINT: firing match.applyMatchState() actually reaches the bound callback end-to-end and feeds the interpolation buffer', () => {
      const match = new ClientMatchModel();
      const view = new MatchHUDView(new ClientIdentityModel(), match, makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);
      const pushSpy = jest.spyOn(view.getInterpolationBuffer(), 'push');
      const state = { matchId: 'm1', tick: 1, participants: [makeParticipant('p1'), makeParticipant('p2')] as [ParticipantSnapshot, ParticipantSnapshot] };

      match.applyMatchState(state);

      expect(callback).toHaveBeenCalled();
      expect(pushSpy).toHaveBeenCalledWith(state);
    });
  });
});
```

### 3. Create `packages/client/src/view/__tests__/MatchHUDScreen.test.tsx` with:

```tsx
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
```

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes; `npx jest MatchHUDView
MatchHUDScreen --coverage --collectCoverageFrom="src/view/MatchHUDView.tsx"` — validated result: **17 tests
passing (7 + 10 across the two files), 100% statement/branch/function/line coverage**, including both
CRITICAL CHECKPOINT tests (the interpolation-buffer-push gating and the never-mutates-`ClientMatchModel`
checkpoint from master context §8). Then run the full client suite (`npx jest -w @arena/client`) — validated
result: **46 tests passing across 6 suites**. Branch `client` from `main` (or reuse an already-checked-out
`client` branch), commit `Step 10: MatchHUDView + MatchHUDScreen implementation and tests`, push, open a PR
into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `InterpolationBuffer`'s output is display-only — never let it or anything derived from it flow
back into `ClientMatchModel`.** This is one of the six named checkpoints in master context §8, and this
prompt's own test suite verifies it at the screen level, not just inside `InterpolationBuffer`'s isolated
unit tests. Per master context §1.1: the client renders what the server sends and never computes an outcome
— the smoothed position is a rendering convenience, not a value the server ever sees or the client ever
asserts as fact.
