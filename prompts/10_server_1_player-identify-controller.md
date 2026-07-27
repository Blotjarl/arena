# Prompt 10_server_1 — PlayerIdentifyController Implementation

**Owner: Marshall.** Load `prompts/00_master_context.md` and `prompts/09-10_implementation_plan.md` first.
This prompt's code below is already validated (implemented and test-run against this real repo) — you are
transcribing proven work, not designing from scratch. Still run everything yourself; don't skip verification.

### CRITICAL prerequisite
`packages/server`'s entire model package (`09_server_1` through `09_server_6`) must already be merged to
`main` — confirm via `git log` before starting. This prompt's controller calls no model methods directly
(see the design note below), but every later `10_server_*` prompt in this batch does, and they all assume
the same starting point.

---

### Design note: why this controller barely touches Model/View
`docs/01_class_list.md` §5b originally sketched `PlayerIdentifyController` as `extends
AbstractController<Player-ish session model, ...>` — left deliberately vague. Real implementation resolves
it: there is no wire event acknowledging a successful `identify` (SRS Appendix A has no `identified`
event), and no server-side repository of players to mutate (the server never writes to PostgreSQL
directly, 2.3). This controller's entire job per R1.1–R1.4 is **validating the username**; establishing
per-connection identity (constructing the `Player`, remembering that this socket is now identified) is
`ConnectionHandler`'s job, since that's the one place per-socket session state naturally lives
(`10_server_6`). `PlayerIdentifyController` therefore keeps the default (untyped) `AbstractController`
generics — exactly like the original Step 2 skeleton's sandwich requirement already allowed — and its
`model`/`view` are structurally required by `AbstractController` but not used by `operation`.

---

### 1. Replace `packages/server/src/controller/PlayerIdentifyController.ts` with:

```ts
import { AbstractController, IdentifyPayload, InvalidUsernameError } from '@arena/shared';

/**
 * Handles the initial `identify` handshake for a new connection: validates the requested username and
 * establishes the player's identity for the rest of the session (R1.1–R1.4).
 *
 * Uses the default (untyped) `AbstractController` generics deliberately — there is no domain Model this
 * controller mutates and no wire event acknowledging a successful identify (SRS Appendix A has no
 * `identified` event), so `model`/`view` are structurally required by `AbstractController` but not used by
 * `operation`. ServerMain supplies the process-wide `MatchmakingQueue`/`MatchmakingBroadcastView` as
 * harmless stand-ins, since real per-player identity tracking (marking a connection identified, building
 * its `Player`) lives on `ConnectionHandler` — the one place a socket's session state persists across
 * events (see `10_server_6`).
 */
export class PlayerIdentifyController extends AbstractController {
  /**
   * Validates an `identify` request. A connection that has not identified successfully is rejected by
   * ConnectionHandler's dispatch guard for every other event (UnidentifiedConnectionError, R1.4).
   * @param action - the identify action, e.g. 'identify'
   * @param payload - the player id and requested username
   * @throws {InvalidUsernameError} if the username is empty or exceeds 24 characters (R1.1–R1.3)
   */
  operation(action: string, payload?: IdentifyPayload): void {
    const username = payload?.username ?? '';
    if (username.length < 1 || username.length > 24) {
      throw new InvalidUsernameError(username);
    }
  }
}
```

### 2. Create `packages/server/src/controller/PlayerIdentifyController.test.ts` with:

```ts
import { InvalidUsernameError } from '@arena/shared';
import { PlayerIdentifyController } from './PlayerIdentifyController';

function makeController(): PlayerIdentifyController {
  const noopModel = { notifyChanged: () => {} };
  const noopView = { getModel: () => noopModel, setModel: () => {}, getController: () => null, setController: () => {} };
  return new PlayerIdentifyController(noopModel as never, noopView as never);
}

describe('PlayerIdentifyController', () => {
  describe('operation', () => {
    it('accepts a 1-24 character username without throwing', () => {
      const controller = makeController();
      expect(() => controller.operation('identify', { playerId: 'p1', username: 'Alice' })).not.toThrow();
      expect(() => controller.operation('identify', { playerId: 'p1', username: 'A'.repeat(24) })).not.toThrow();
      expect(() => controller.operation('identify', { playerId: 'p1', username: 'A' })).not.toThrow();
    });

    it('throws InvalidUsernameError for an empty username', () => {
      const controller = makeController();
      expect(() => controller.operation('identify', { playerId: 'p1', username: '' })).toThrow(InvalidUsernameError);
    });

    it('throws InvalidUsernameError for a username over 24 characters', () => {
      const controller = makeController();
      expect(() => controller.operation('identify', { playerId: 'p1', username: 'A'.repeat(25) })).toThrow(
        InvalidUsernameError,
      );
    });

    it('throws InvalidUsernameError when payload is missing entirely', () => {
      const controller = makeController();
      expect(() => controller.operation('identify')).toThrow(InvalidUsernameError);
    });
  });
});
```

---

### 3. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` passes; `npx jest
PlayerIdentifyController --coverage --collectCoverageFrom="src/controller/PlayerIdentifyController.ts"` —
validated result: **4 tests passing, 100% statement/branch/function/line coverage**. Branch `server` from
`main` (or reuse an already-checked-out `server` branch), commit `Step 10: PlayerIdentifyController
implementation and tests`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Do not add a `Player`-tracking model to this controller "while you're in there."**
`ConnectionHandler` (`10_server_6`) is where per-connection identity actually lives — this controller stays
a pure validator. Giving it real state would duplicate the identity ConnectionHandler already tracks and
create two sources of truth for "is this connection identified."
