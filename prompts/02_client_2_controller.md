# Prompt 02_client_2 — Client Controller Package

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm `02_client_1` (client model) is merged.** This
prompt fills in `packages/client/src/controller/` (`docs/01_class_list.md` §6b). **MANDATORY**:
`SocketConnectionController` does **not** extend `AbstractController` — like `ConnectionHandler` on the
server, it's a transport adapter coordinating three models, not a one-model/one-view controller. This is a
correction to `docs/01_class_list.md` §6b, noted here and to be reflected back into that document in a
later pass.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/client/src/controller/*.ts` are empty placeholders; client `model/` is complete.
- **End**: `LobbyController`/`ChampionSelectController`/`MatchController` compile against the loose
  `AbstractController` generics — `client/view/` doesn't exist until `02_client_3`.

---

### 1. `controller/SocketConnectionController.ts` — plain adapter
```ts
import { NotImplementedError } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { ClientMatchModel } from '../model/ClientMatchModel';

export interface ClientModels {
  identity: ClientIdentityModel;
  queue: ClientQueueModel;
  match: ClientMatchModel;
}

/** Owns the Socket.IO client connection; sends outbound requests; routes inbound events into the matching model's apply*() method. */
export class SocketConnectionController {
  constructor(private readonly models: ClientModels) {}

  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('SocketConnectionController.operation not yet implemented');
  }

  private bindInboundEvents(): void {
    throw new NotImplementedError('SocketConnectionController.bindInboundEvents not yet implemented');
  }
}
```

### 2. `controller/LobbyController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';

export class LobbyController extends AbstractController {
  /** Client-side non-empty/≤24-char check mirroring R1.1 before delegating to SocketConnectionController. */
  operation(action: string, payload?: { username: string }): void {
    throw new NotImplementedError('LobbyController.operation not yet implemented');
  }
}
```

### 3. `controller/ChampionSelectController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';

export class ChampionSelectController extends AbstractController {
  operation(action: string, payload?: { championId: string }): void {
    throw new NotImplementedError('ChampionSelectController.operation not yet implemented');
  }
}
```

### 4. `controller/MatchController.ts`
```ts
import { AbstractController, NotImplementedError } from '@arena/shared';

export class MatchController extends AbstractController {
  /** Throttles/sends match:action for 'move' | 'useAbility'. */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchController.operation not yet implemented');
  }
}
```

---

### 5. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` succeeds. Branch `client`, commit
`Step 2: client controller package`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: This package's `ChampionSelectController` has the same name as `packages/server`'s — they are
different classes in different packages (TypeScript module scoping handles this correctly); do not merge
or alias them.**
