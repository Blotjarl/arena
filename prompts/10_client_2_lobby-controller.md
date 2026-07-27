# Prompt 10_client_2 — LobbyController Implementation

**Owner: Raj.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`10_client_1` (`SocketConnectionController`) must be merged first — this controller has nothing to actually
emit through without it.

### CRITICAL: the client-side username check is a UX precheck only, never the enforcer
This controller re-implements R1.1's non-empty/24-character rule purely so the Lobby screen can give
instant feedback without a round trip. **The server (`PlayerIdentifyController`, already implemented)
unconditionally re-validates the same constraint and is the sole authority on whether a username is
accepted.** A username that passes this client-side check can still be rejected server-side (e.g. a
different validation rule added later, or a race on a duplicate identifier) — never write code, comments,
or UI copy that implies a passing client check guarantees server acceptance. Per master context §1.1: the
client is a display and input device only, and forwards requests — it never asserts an outcome.

---

### Design notes — two gaps found by implementing this for real

**1. This controller needs a `SocketConnectionController` reference, not just `(model, view)`.**
`docs/01_class_list.md` §6b's constructor sketch is silent on this (it only documents the inherited
`AbstractController` shape), but there is nothing to actually emit `identify`/`queue:join`/`queue:cancel`
through without one — the exact same gap `MatchmakingController` closed on the server side by taking extra
constructor parameters beyond `(model, view)` (`10_server_2`). Add a third constructor parameter.

**2. `IdentifyPayload` requires a `playerId`, but nothing generates one yet.** `ClientIdentityModel.identify()`
(already implemented, `09_client_1`) only sets `username` and *restores* `playerId` from `sessionStorage` if
one is already there (a page-reload scenario) — nothing generates a fresh one on a brand-new session, and
`ClientIdentityModel`'s own tests (`ClientIdentityModel.test.ts`, already merged) explicitly document that
`playerId` starts and stays `null` until "the controller" sets it directly (it's a public field, not a
setter method). This controller is that controller: on `submitUsername`, if `model.playerId` is still
`null` after `identify()`, it generates a client-side session id (`crypto.randomUUID()`, falling back to a
`crypto.getRandomValues()`-based UUIDv4 builder for test environments — see design note below), assigns it
directly to `model.playerId`, and persists it to `sessionStorage` under the same `arena:playerId` key
`ClientIdentityModel` already reads on construction. This is *not* a divergence from
`docs/01_class_list.md` — `ClientIdentityModel`'s attribute table already lists `playerId: PlayerId | null`
as a plain public field, exactly the shape this relies on.

**Why the `crypto.randomUUID` fallback exists:** it's available in every evergreen browser R-D7 targets, but
this project's jsdom-based Jest test environment (`jest-environment-jsdom` 29.7, per `packages/client/jest.config.js`)
does not implement it — only `crypto.getRandomValues` is present there. Detect and fall back rather than
skip testing this path; do not add a test-only branch.

---

### 1. Replace `packages/client/src/controller/LobbyController.ts` with:

```ts
import { AbstractController, InvalidUsernameError, SOCKET_EVENTS, IdentifyPayload } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import type { LobbyView } from '../view/LobbyView';
import { SocketConnectionController } from './SocketConnectionController';

/**
 * Generates a client-side session identifier. Prefers `crypto.randomUUID()` (available in every
 * evergreen browser targeted by R-D7); falls back to building a UUIDv4 from `crypto.getRandomValues`
 * for environments (e.g. this project's jsdom-based Jest tests) where `randomUUID` itself is absent
 * but the underlying RNG still is.
 */
function generateClientId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Handles user interactions on the Lobby screen: username submission and queue join/cancel (R1.1, R2.1).
 * Delegates all socket communication to SocketConnectionController.
 */
export class LobbyController extends AbstractController<ClientIdentityModel, LobbyView> {
  /**
   * CORRECTION (Step 10): `docs/01_class_list.md` §6b's constructor sketch only lists `(model, view)`
   * inherited from `AbstractController`, but this controller has nothing to actually emit through without
   * a `SocketConnectionController` reference — the same gap `MatchmakingController` closed on the server
   * side with its extra constructor parameters beyond `(model, view)`.
   * @param model - the identity model this controller mutates on a successful client-side precheck
   * @param view - the paired LobbyView
   * @param socketController - used to emit `identify`/`queue:join`/`queue:cancel` to the server
   */
  constructor(
    model: ClientIdentityModel,
    view: LobbyView,
    private readonly socketController: SocketConnectionController,
  ) {
    super(model, view);
  }

  /**
   * Dispatches a lobby action: 'submitUsername', 'joinQueue', 'cancelQueue', or 'returnToQueue'
   * (the latter used by ResultsScreen's "return to queue" control, per docs/01_class_list.md §6c's
   * documented gap-fill — pairing ResultsView with LobbyController rather than a dedicated controller).
   *
   * For 'submitUsername': performs a client-side UX pre-check that the username is non-empty and
   * at most 24 characters before forwarding to the server (R1.1). **This pre-check is for
   * immediate UI feedback only — the server unconditionally re-validates the same constraints and
   * is the authoritative enforcer. A passing client-side check does not guarantee acceptance.**
   * On success, stores the username on the identity model, generates a client-side session
   * identifier the first time (persisted across reload via ClientIdentityModel's own sessionStorage
   * handling of `arena:playerId`), and forwards an `identify` request to the server.
   *
   * 'joinQueue' and 'returnToQueue' both emit `queue:join` with no payload — the server derives the
   * requesting player from the connection's already-identified state (docs/01_class_list.md §5b,
   * `ConnectionHandler`), not from anything this controller sends. 'cancelQueue' emits `queue:cancel`,
   * also with no payload.
   * @param action - the lobby action to dispatch
   * @param payload - for 'submitUsername', the username string; omitted for queue actions
   * @throws {InvalidUsernameError} if 'submitUsername' fails the client-side precheck (R1.1)
   */
  operation(action: string, payload?: { username: string }): void {
    switch (action) {
      case 'submitUsername': {
        const username = payload?.username ?? '';
        if (username.trim().length === 0 || username.length > 24) {
          throw new InvalidUsernameError(username);
        }
        this.model.identify(username);
        if (this.model.playerId === null) {
          this.model.playerId = generateClientId();
          const storage: Storage | null = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
          storage?.setItem('arena:playerId', this.model.playerId);
        }
        const identifyPayload: IdentifyPayload = { playerId: this.model.playerId, username };
        this.socketController.operation(SOCKET_EVENTS.IDENTIFY, identifyPayload);
        break;
      }
      case 'joinQueue':
      case 'returnToQueue':
        this.socketController.operation(SOCKET_EVENTS.QUEUE_JOIN);
        break;
      case 'cancelQueue':
        this.socketController.operation(SOCKET_EVENTS.QUEUE_CANCEL);
        break;
    }
  }
}
```

### 2. Create `packages/client/src/controller/LobbyController.test.ts` with:

```ts
import { InvalidUsernameError } from '@arena/shared';
import { LobbyController } from './LobbyController';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import type { LobbyView } from '../view/LobbyView';
import type { SocketConnectionController } from './SocketConnectionController';

function makeSocketController(): SocketConnectionController & { operation: jest.Mock } {
  return { operation: jest.fn() } as unknown as SocketConnectionController & { operation: jest.Mock };
}

function makeView(): LobbyView {
  return {} as unknown as LobbyView;
}

describe('LobbyController', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('submitUsername', () => {
    it('stores the username on the model and forwards identify with a generated playerId', () => {
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);

      controller.operation('submitUsername', { username: 'Raj' });

      expect(model.username).toBe('Raj');
      expect(model.playerId).not.toBeNull();
      expect(socketController.operation).toHaveBeenCalledWith('identify', {
        playerId: model.playerId,
        username: 'Raj',
      });
    });

    it('reuses a playerId already restored from sessionStorage rather than generating a new one', () => {
      sessionStorage.setItem('arena:playerId', 'player-99');
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);

      controller.operation('submitUsername', { username: 'Raj' });

      expect(model.playerId).toBe('player-99');
      expect(socketController.operation).toHaveBeenCalledWith('identify', {
        playerId: 'player-99',
        username: 'Raj',
      });
    });

    it('throws InvalidUsernameError and does not forward when the username is empty', () => {
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);

      expect(() => controller.operation('submitUsername', { username: '' })).toThrow(InvalidUsernameError);
      expect(socketController.operation).not.toHaveBeenCalled();
    });

    it('throws InvalidUsernameError and does not forward when the username exceeds 24 characters', () => {
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);
      const tooLong = 'a'.repeat(25);

      expect(() => controller.operation('submitUsername', { username: tooLong })).toThrow(InvalidUsernameError);
      expect(socketController.operation).not.toHaveBeenCalled();
    });

    it('throws InvalidUsernameError when payload is omitted entirely', () => {
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), makeSocketController());
      expect(() => controller.operation('submitUsername')).toThrow(InvalidUsernameError);
    });

    it('does not persist to sessionStorage when it is unavailable (non-browser environment guard)', () => {
      const original = (globalThis as { sessionStorage?: Storage }).sessionStorage;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).sessionStorage;
      try {
        const model = new ClientIdentityModel();
        const socketController = makeSocketController();
        const controller = new LobbyController(model, makeView(), socketController);

        expect(() => controller.operation('submitUsername', { username: 'Raj' })).not.toThrow();
        expect(model.playerId).not.toBeNull();
      } finally {
        (globalThis as { sessionStorage?: Storage }).sessionStorage = original;
      }
    });

    it('uses crypto.randomUUID() directly when the runtime provides it', () => {
      const original = crypto.randomUUID;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (crypto as any).randomUUID = () => 'fixed-uuid';
      try {
        const model = new ClientIdentityModel();
        const socketController = makeSocketController();
        const controller = new LobbyController(model, makeView(), socketController);

        controller.operation('submitUsername', { username: 'Raj' });

        expect(model.playerId).toBe('fixed-uuid');
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (crypto as any).randomUUID = original;
      }
    });

    it('accepts a username at exactly the 24-character boundary', () => {
      const model = new ClientIdentityModel();
      const socketController = makeSocketController();
      const controller = new LobbyController(model, makeView(), socketController);
      const exactly24 = 'a'.repeat(24);

      expect(() => controller.operation('submitUsername', { username: exactly24 })).not.toThrow();
      expect(socketController.operation).toHaveBeenCalledWith('identify', expect.objectContaining({ username: exactly24 }));
    });
  });

  describe('joinQueue / returnToQueue', () => {
    it('joinQueue emits queue:join with no payload', () => {
      const socketController = makeSocketController();
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), socketController);

      controller.operation('joinQueue');

      expect(socketController.operation).toHaveBeenCalledWith('queue:join');
    });

    it('returnToQueue also emits queue:join with no payload (ResultsScreen gap-fill, docs/01_class_list.md §6c)', () => {
      const socketController = makeSocketController();
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), socketController);

      controller.operation('returnToQueue');

      expect(socketController.operation).toHaveBeenCalledWith('queue:join');
    });
  });

  describe('cancelQueue', () => {
    it('emits queue:cancel with no payload', () => {
      const socketController = makeSocketController();
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), socketController);

      controller.operation('cancelQueue');

      expect(socketController.operation).toHaveBeenCalledWith('queue:cancel');
    });
  });

  describe('unrecognized action', () => {
    it('does nothing and does not throw', () => {
      const socketController = makeSocketController();
      const controller = new LobbyController(new ClientIdentityModel(), makeView(), socketController);

      expect(() => controller.operation('nonsense')).not.toThrow();
      expect(socketController.operation).not.toHaveBeenCalled();
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` passes; `npx jest LobbyController
--coverage --collectCoverageFrom="src/controller/LobbyController.ts"` — validated result: **12 tests
passing, 100% statement/branch/function/line coverage**. Also re-run the full client suite (`npx jest -w
@arena/client`) to confirm no regressions — validated result: **41 tests passing across 5 suites**. Branch
`client` from `main` (or reuse an already-checked-out `client` branch), commit `Step 10: LobbyController
implementation and tests`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: the client-side username precheck is UX-only.** Never let this controller (or any future code
that calls it) treat a passing `submitUsername` call as proof the username is accepted — the server's
`PlayerIdentifyController` is the sole authority (R1.1), and `identify` can still be rejected after this
controller forwards it. Per master context §1.1: the client renders what the server sends and never
computes an outcome.
