# Prompt 02_server_2 — Server Controller Package

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm `02_server_1` (server model) is merged.** This
prompt fills in `packages/server/src/controller/` (`docs/01_class_list.md` §5b). **MANDATORY**: the five
`*Controller` classes extend `AbstractController` and implement the `operation(action, payload)`
dispatcher; `ConnectionHandler` and `MatchReportingClient` do **not** — they are plain transport adapters,
kept separate so game logic stays testable without a live socket (master context §4.2, 3.6.4).

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/server/src/controller/*.ts` are empty placeholders; server `model/` is complete.
- **End**: every controller compiles against the loose `AbstractController` (default `Model`/`View`
  generics) — do not import a concrete `View` subclass here, since `server/view/` doesn't exist until
  `02_server_3`. Narrowing the generics is a Step 3+ refinement, not this prompt's job.

---

### 1. `controller/PlayerIdentifyController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';
import { IdentifyPayload } from '@arena/shared';

export class PlayerIdentifyController extends AbstractController {
  /** @throws InvalidUsernameError */
  operation(action: string, payload?: IdentifyPayload): void {
    throw new NotImplementedError('PlayerIdentifyController.operation not yet implemented');
  }
}
```

### 2. `controller/MatchmakingController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';

export class MatchmakingController extends AbstractController {
  /** @throws AlreadyQueuedError | NotQueuedError — on pairing, constructs a new MatchModel + MatchBroadcastView (R2.6). */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchmakingController.operation not yet implemented');
  }
}
```

### 3. `controller/ChampionSelectController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';

export class ChampionSelectController extends AbstractController {
  /** Catches InvalidChampionSelectionError/SelectionWindowExpiredError from the model and asks the view
   *  to emit an `error` payload — never surfaces the raw exception to the socket. */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('ChampionSelectController.operation not yet implemented');
  }
}
```

### 4. `controller/CombatController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';

export class CombatController extends AbstractController {
  /** R4.1, R4.2 — a validation failure is swallowed per spec, not surfaced as an exception to the player. */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('CombatController.operation not yet implemented');
  }
}
```

### 5. `controller/DisconnectController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';

export class DisconnectController extends AbstractController {
  /** @throws GracePeriodExpiredError — owns the grace-period timer (R6.1–R6.4). */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('DisconnectController.operation not yet implemented');
  }
}
```

### 6. `controller/ConnectionHandler.ts` — plain adapter, not AbstractController
```ts
import { NotImplementedError } from '@arena/shared';
import type { Socket } from 'socket.io';
import { PlayerIdentifyController } from './PlayerIdentifyController';
import { MatchmakingController } from './MatchmakingController';
import { ChampionSelectController } from './ChampionSelectController';
import { CombatController } from './CombatController';
import { DisconnectController } from './DisconnectController';

export interface ConnectionControllers {
  identify: PlayerIdentifyController;
  matchmaking: MatchmakingController;
  championSelect: ChampionSelectController;
  combat: CombatController;
  disconnect: DisconnectController;
}

export class ConnectionHandler {
  constructor(
    private readonly socket: Socket,
    private readonly controllers: ConnectionControllers,
  ) {}

  /** Binds socket.on(eventName, ...) for every inbound event in SOCKET_EVENTS, forwarding to the matching controller's operation(). */
  register(): void {
    throw new NotImplementedError('ConnectionHandler.register not yet implemented');
  }
}
```

### 7. `controller/MatchReportingClient.ts` — plain HTTP client, not MVC
```ts
import { MatchId, MatchParticipant, NotImplementedError } from '@arena/shared';

/** Reports match begin/end to packages/api over HTTP. Log-and-swallow on failure — never throws into match simulation (R7.4). */
export class MatchReportingClient {
  constructor(private readonly apiBaseUrl: string) {}

  async reportMatchBegin(matchId: MatchId, participants: MatchParticipant[]): Promise<void> {
    throw new NotImplementedError('MatchReportingClient.reportMatchBegin not yet implemented');
  }

  async reportMatchEnd(matchId: MatchId, outcome: unknown): Promise<void> {
    throw new NotImplementedError('MatchReportingClient.reportMatchEnd not yet implemented');
  }
}
```

---

### 8. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` succeeds. Branch `server`, commit
`Step 2: server controller package`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: If a fresh reading of `docs/01_class_list.md` §5b suggests `ConnectionHandler` or
`MatchReportingClient` should extend `AbstractController`, don't — that document will be corrected in a
follow-up pass; this prompt's plain-adapter shape is the deliberate, reviewed decision.**
