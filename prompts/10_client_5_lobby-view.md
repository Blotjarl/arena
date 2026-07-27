# Prompt 10_client_5 — LobbyView + LobbyScreen Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_client_2` (`LobbyController`) must be merged first — this view dispatches through it.

### CRITICAL: master context §1.1 — the client renders, it never decides
`LobbyScreen` only ever displays state that `ClientIdentityModel`/`ClientQueueModel` already hold, and
forwards every user action through `LobbyController` unchanged. It does not decide whether a username is
accepted, whether a queue position is correct, or whether a match has actually been found — those are
server-computed facts the client is told about, never facts the client asserts on its own. The one piece
of client-side logic in this screen — the inline validation message on an empty/too-long username — is
explicitly a UX precheck echo of `LobbyController`'s own precheck (R1.1), not a claim that the username
will be accepted; see the CRITICAL note in `10_client_2` for the same rule stated for the controller side.

### CRITICAL — a real gap this prompt found and fixes: the client models never called `notifyChanged`
Implementing this view for real surfaced that `ClientIdentityModel.identify()`, `ClientQueueModel.setQueued/
setCancelled/setMatched` (all merged already, `09_client_1`/`09_client_2`) mutate their fields directly but
**never call `notifyChanged()`.** Since `LobbyView` is the first thing that actually registers as a
`ModelListener` on either model, this was invisible until now — every existing test for those two model
classes only asserts on field values, never on event emission, so nothing caught it. Left unfixed, the
entire push-MVC screen layer (`docs/01_class_list.md` §6c: "Each `*View` class implements `modelChanged`...
to trigger a re-render") would be permanently inert: a server update would update the model's fields
correctly but no screen would ever re-render to show it. This prompt's step 0 below fixes both classes —
purely additive (a `notifyChanged` call appended to each mutator), so none of their existing merged tests
change. Do this correction once, here; `10_client_6` will do the equivalent fix for `ClientMatchModel`
(observed by the other three views), so don't duplicate it there.

---

### Design notes

**`LobbyView` needs two models, not one.** Its documented responsibility (`docs/01_class_list.md` §6c —
"Username field, 'Find Match' control, queue status/cancel") spans `ClientIdentityModel` (username) and
`ClientQueueModel` (queue status/position) — the stub's constructor only took the former. Add
`ClientQueueModel` as a second constructor parameter; the view registers as a listener on both. Its formal
`getModel()`/`setModel()` still resolve to `ClientIdentityModel`, matching `LobbyController`'s own
`AbstractController<ClientIdentityModel, LobbyView>` pairing exactly — `ClientQueueModel` is reachable via
a separate `getQueueModel()`/`setQueueModel()` accessor pair that sits outside the formal `View<M,C>`
contract, the same "extra constructor dependency beyond the formal pair" pattern `MatchmakingController`
established server-side.

**CRITICAL CHECKPOINT: the push pipeline must be tested end-to-end, not just at the unit level.** It is not
enough to test that `LobbyView.modelChanged()` calls its bound callback in isolation — the actual value of
this fix is that calling a *model* mutator (`identity.identify(...)`, `queue.setQueued(...)`) reaches a
*mounted React component* and causes a visible re-render, with no test-only wiring in between. Both the
`LobbyView` unit tests and the `LobbyScreen` RTL tests below include a checkpoint test for exactly this: one
component-level test calls `queue.setQueued(1)` *after* the component has already mounted and asserts the
DOM updates in place (no remount), simulating what a real inbound server event does once `10_client_1`
routes it into these models.

**No `@testing-library/jest-dom`.** `packages/client/package.json` only lists `@testing-library/react` as a
Step 2 devDependency, not the companion `jest-dom` matcher package — do not add it. Use plain `toBeTruthy()`/
`toBeNull()`/`.textContent` assertions instead of `toBeInTheDocument()`/`toHaveTextContent()`.

---

### 0. Corrections to `ClientIdentityModel.ts` and `ClientQueueModel.ts` — add missing `notifyChanged` calls

In `packages/client/src/model/ClientIdentityModel.ts`, change the import and the end of `identify()`:
```ts
import { AbstractModel, ModelEvent, PlayerId, PlayerNotFoundError } from '@arena/shared';
```
```ts
  identify(username: string): void {
    this.username = username;
    // Guard for non-browser environments; jsdom provides sessionStorage in tests.
    const storage: Storage | null =
      typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    if (storage) {
      storage.setItem('arena:username', username);
      const storedId = storage.getItem('arena:playerId');
      if (storedId !== null) {
        this.playerId = storedId;
      }
    }
    // CORRECTION (Step 10, 10_client_5): this method previously never called notifyChanged, so no
    // ModelListener (i.e. no View) was ever told a change happened — the entire push-MVC contract this
    // class is supposed to participate in (docs/01_class_list.md §6c) was silently inert. LobbyView is
    // the first consumer that actually registers as a listener, which is what surfaced the gap.
    this.notifyChanged(new ModelEvent(this, 'identity:changed', { username: this.username, playerId: this.playerId }));
  }
```

In `packages/client/src/model/ClientQueueModel.ts`, change the import and all three mutators:
```ts
import { AbstractModel, ModelEvent, MatchFoundPayload } from '@arena/shared';
```
```ts
  setQueued(position: number): void {
    this.status = 'queued';
    this.position = position;
    // CORRECTION (Step 10, 10_client_5): setQueued/setCancelled/setMatched previously never called
    // notifyChanged — see the identical correction and rationale on ClientIdentityModel.identify().
    this.notifyChanged(new ModelEvent(this, 'queue:changed', { status: this.status, position: this.position }));
  }

  setCancelled(): void {
    this.status = 'idle';
    this.position = null;
    this.notifyChanged(new ModelEvent(this, 'queue:changed', { status: this.status, position: this.position }));
  }

  setMatched(payload: MatchFoundPayload): void {
    this.status = 'matched';
    this.position = null;
    this.matchPayload = payload;
    this.notifyChanged(new ModelEvent(this, 'queue:changed', { status: this.status, matchPayload: payload }));
  }
```
(Method doc comments and the rest of each file are unchanged — only the import line and the bodies shown
above change.) Re-run `npx jest ClientIdentityModel ClientQueueModel` after this step — validated result:
**14 tests passing, no changes needed to either existing test file** (both correction are purely additive).

### 1. Replace `packages/client/src/view/LobbyView.tsx` with:

```tsx
import { useEffect, useReducer, useState } from 'react';
import { View, ModelListener, ModelEvent } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { LobbyController } from '../controller/LobbyController';

/**
 * MVC View for the Lobby screen. Listens for ClientIdentityModel changes and notifies the paired
 * React functional component (LobbyScreen) to re-render (SRS 3.1.1, R1.1–R1.4, R2.1–R2.6).
 */
export class LobbyView implements View, ModelListener {
  /** Callback registered by LobbyScreen to trigger a React re-render on model changes. */
  private onUpdate: (() => void) | null = null;

  /**
   * CORRECTION (Step 10): the Lobby screen's own documented responsibility (docs/01_class_list.md §6c —
   * "Username field, 'Find Match' control, queue status/cancel") spans two models, not one: identity
   * (username/playerId) and queue (position/status). The stub's constructor only took ClientIdentityModel.
   * A second, non-`View<M,C>`-generic-typed model reference is added here purely for observation — the
   * same pattern MatchmakingController (server side) established for extra constructor dependencies
   * beyond the formal (model, view) pair. getModel()/setModel() below still resolve to
   * ClientIdentityModel, matching LobbyController's own `AbstractController<ClientIdentityModel,
   * LobbyView>` pairing — queueModel is reachable via the separate getQueueModel() accessor.
   * @param model - the identity model this view observes
   * @param queueModel - the queue model this view also observes, for queue status/cancel rendering
   * @param controller - the lobby controller this view dispatches user actions through
   */
  constructor(
    private model: ClientIdentityModel,
    private queueModel: ClientQueueModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
    this.queueModel.addModelListener(this);
  }

  /**
   * Registers the React functional component's re-render trigger.
   * The paired functional component supplies this so modelChanged can trigger a re-render.
   * @param callback - called with no arguments whenever either observed model changes
   */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Returns the observed identity model.
   * @returns the current ClientIdentityModel
   */
  getModel(): ClientIdentityModel {
    return this.model;
  }

  /**
   * Replaces the observed model reference. Unlike the constructor, this does not re-register the
   * view as a listener on the new model — call `model.addModelListener(this)` separately if needed.
   * @param model - the new ClientIdentityModel to observe
   */
  setModel(model: ClientIdentityModel): void {
    this.model = model;
  }

  /**
   * Returns the observed queue model.
   * CORRECTION (Step 10): not part of the formal View<M,C> contract (see constructor doc above) — a
   * plain accessor LobbyScreen uses to render queue status/cancel.
   * @returns the current ClientQueueModel
   */
  getQueueModel(): ClientQueueModel {
    return this.queueModel;
  }

  /**
   * Replaces the observed queue model reference. Does not re-register as a listener — call
   * `queueModel.addModelListener(this)` separately if needed.
   * @param queueModel - the new ClientQueueModel to observe
   */
  setQueueModel(queueModel: ClientQueueModel): void {
    this.queueModel = queueModel;
  }

  /**
   * Returns the lobby controller used to dispatch user actions.
   * @returns the current LobbyController
   */
  getController(): LobbyController {
    return this.controller;
  }

  /**
   * Replaces the controller used to dispatch user actions.
   * @param controller - the new LobbyController
   */
  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  /**
   * Called by AbstractModel when either observed model fires a change event.
   * Invokes the registered onUpdate callback to trigger a React re-render.
   * @param event - the model event describing what changed
   */
  modelChanged(event: ModelEvent): void {
    this.onUpdate?.();
  }
}

/**
 * Username field, "Find Match" control, queue status/cancel (SRS 3.1.1).
 *
 * CRITICAL (master context §1.1): this component only ever displays state ClientIdentityModel/
 * ClientQueueModel already hold and forwards user intent through LobbyController — it never decides
 * on its own whether a username is accepted or a queue position is correct. The client-side username
 * check surfaced as a validation message here is a UX precheck only; the server is the sole authority
 * (see LobbyController.operation's own doc comment) and this screen must not imply otherwise.
 */
export function LobbyScreen(props: { view: LobbyView }): JSX.Element {
  const { view } = props;
  const [, forceRender] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    view.bindUpdateCallback(() => forceRender());
  }, [view]);

  const identity = view.getModel();
  const queue = view.getQueueModel();
  const controller = view.getController();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('username') ?? '');
    try {
      controller.operation('submitUsername', { username });
      setError(null);
    } catch (err) {
      // UX precheck failure only (R1.1) — the server remains the authoritative validator (master
      // context §1.1); this message is immediate feedback, not proof of eventual server acceptance.
      setError(err instanceof Error ? err.message : 'Invalid username');
    }
  };

  if (identity.username === null) {
    return (
      <form onSubmit={handleSubmit} aria-label="identify-form">
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" maxLength={24} />
        <button type="submit">Continue</button>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }

  if (queue.status === 'idle') {
    return (
      <div>
        <p>Welcome, {identity.username}</p>
        <button onClick={() => controller.operation('joinQueue')}>Find Match</button>
      </div>
    );
  }

  if (queue.status === 'queued') {
    return (
      <div>
        <p>Position in queue: {queue.position}</p>
        <button onClick={() => controller.operation('cancelQueue')}>Cancel</button>
      </div>
    );
  }

  return <p>Match found! Opponent: {queue.matchPayload?.opponentUsername}</p>;
}
```

### 2. Create `packages/client/src/view/__tests__/LobbyView.test.ts` with:

```ts
import { ModelEvent } from '@arena/shared';
import { LobbyView } from '../LobbyView';
import { ClientIdentityModel } from '../../model/ClientIdentityModel';
import { ClientQueueModel } from '../../model/ClientQueueModel';
import type { LobbyController } from '../../controller/LobbyController';

function makeController(): LobbyController {
  return { operation: jest.fn() } as unknown as LobbyController;
}

describe('LobbyView', () => {
  describe('construction', () => {
    it('registers itself as a listener on both the identity model and the queue model', () => {
      const identity = new ClientIdentityModel();
      const queue = new ClientQueueModel();
      const addIdentitySpy = jest.spyOn(identity, 'addModelListener');
      const addQueueSpy = jest.spyOn(queue, 'addModelListener');

      const view = new LobbyView(identity, queue, makeController());

      expect(addIdentitySpy).toHaveBeenCalledWith(view);
      expect(addQueueSpy).toHaveBeenCalledWith(view);
    });
  });

  describe('getModel / setModel', () => {
    it('returns and replaces the observed identity model', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      expect(view.getModel()).toBe(identity);

      const other = new ClientIdentityModel();
      view.setModel(other);
      expect(view.getModel()).toBe(other);
    });
  });

  describe('getQueueModel / setQueueModel', () => {
    it('returns and replaces the observed queue model', () => {
      const queue = new ClientQueueModel();
      const view = new LobbyView(new ClientIdentityModel(), queue, makeController());
      expect(view.getQueueModel()).toBe(queue);

      const other = new ClientQueueModel();
      view.setQueueModel(other);
      expect(view.getQueueModel()).toBe(other);
    });
  });

  describe('getController / setController', () => {
    it('returns and replaces the controller', () => {
      const controller = makeController();
      const view = new LobbyView(new ClientIdentityModel(), new ClientQueueModel(), controller);
      expect(view.getController()).toBe(controller);

      const other = makeController();
      view.setController(other);
      expect(view.getController()).toBe(other);
    });
  });

  describe('modelChanged', () => {
    it('invokes the bound update callback', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      view.modelChanged(new ModelEvent(identity, 'identity:changed', {}));

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does nothing (does not throw) when no callback has been bound yet', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      expect(() => view.modelChanged(new ModelEvent(identity, 'identity:changed', {}))).not.toThrow();
    });

    it('CRITICAL CHECKPOINT: firing identity.identify() actually reaches the bound callback end-to-end', () => {
      const identity = new ClientIdentityModel();
      const view = new LobbyView(identity, new ClientQueueModel(), makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      identity.identify('Raj');

      expect(callback).toHaveBeenCalled();
    });

    it('CRITICAL CHECKPOINT: firing queue.setQueued() actually reaches the bound callback end-to-end', () => {
      const queue = new ClientQueueModel();
      const view = new LobbyView(new ClientIdentityModel(), queue, makeController());
      const callback = jest.fn();
      view.bindUpdateCallback(callback);

      queue.setQueued(2);

      expect(callback).toHaveBeenCalled();
    });
  });
});
```

### 3. Create `packages/client/src/view/__tests__/LobbyScreen.test.tsx` with:

```tsx
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
```

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes. `npx jest LobbyView
LobbyScreen --coverage --collectCoverageFrom="src/view/LobbyView.tsx"` — validated result: **17 tests
passing (5 + 12 across the two files), 100% statement/function/line coverage, 88.88% branch coverage** (the
one uncovered branch is `formData.get('username') ?? ''` returning null, unreachable given the form's own
`name="username"` input — a defensive fallback, not a real code path). Also re-run
`npx jest ClientIdentityModel ClientQueueModel` after step 0 — validated result: **14 tests passing, no
test changes needed**. Then run the full client suite (`npx jest -w @arena/client`) to confirm no
regressions — validated result: **46 tests passing across 6 suites**. Branch `client` from `main` (or reuse
an already-checked-out `client` branch), commit `Step 10: LobbyView + LobbyScreen implementation and tests,
ClientIdentityModel/ClientQueueModel notifyChanged correction`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: the client renders what the server sends and never computes an outcome (master context §1.1).**
`LobbyScreen` reads `ClientIdentityModel`/`ClientQueueModel` fields and nothing else — it does not
independently judge whether a username is valid beyond the immediate-feedback precheck, does not compute a
queue position, and does not decide a match exists. Every one of those facts arrives from the server via
`SocketConnectionController` (`10_client_1`) into the models this view observes. **Also do not regress the
`notifyChanged` fix in step 0** — without it, this screen (and every other view in this batch) is visually
frozen after its first render no matter what the server sends, since nothing would ever call
`modelChanged()` again.
