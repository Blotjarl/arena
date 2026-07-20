# Prompt 02_server_3 — Server View Package and Entry Point

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm `02_server_2` (server controllers) is merged.**
This prompt fills in `packages/server/src/view/`, `ServerMain.ts`, and `index.ts`
(`docs/01_class_list.md` §5c–d) — the last server prompt in Step 2. **MANDATORY**: both view classes
register themselves as a listener in their constructor, mirroring the course's `JFrameView` pattern.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/server/src/view/*.ts`, `ServerMain.ts`, `index.ts` are empty placeholders; server
  `model/` and `controller/` are complete.
- **End**: `npm run typecheck -w @arena/server` succeeds for the whole package — this closes out
  `packages/server`'s Step 2 skeleton.

---

### 1. `view/MatchmakingBroadcastView.ts`
```ts
import { View, ModelListener, ModelEvent, PlayerId, NotImplementedError } from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchmakingQueue } from '../model/MatchmakingQueue';

export class MatchmakingBroadcastView implements View, ModelListener {
  constructor(
    private model: MatchmakingQueue,
    private sockets: Map<PlayerId, Socket>,
  ) {
    this.model.addModelListener(this);
  }

  getModel(): MatchmakingQueue {
    return this.model;
  }

  setModel(model: MatchmakingQueue): void {
    this.model = model;
  }

  /** No natural controller pairing for a pure broadcaster — not applicable, see class-list note below. */
  getController(): never {
    throw new NotImplementedError('MatchmakingBroadcastView.getController is not applicable');
  }

  setController(): void {
    throw new NotImplementedError('MatchmakingBroadcastView.setController is not applicable');
  }

  /** Emits queue:joined / queue:cancelled / match:found depending on event.type. */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchmakingBroadcastView.modelChanged not yet implemented');
  }
}
```

### 2. `view/MatchBroadcastView.ts`
```ts
import { View, ModelListener, ModelEvent, PlayerId, NotImplementedError } from '@arena/shared';
import type { Socket } from 'socket.io';
import { MatchModel } from '../model/MatchModel';

export class MatchBroadcastView implements View, ModelListener {
  constructor(
    private model: MatchModel,
    private sockets: Map<PlayerId, Socket>,
  ) {
    this.model.addModelListener(this);
  }

  getModel(): MatchModel {
    return this.model;
  }

  setModel(model: MatchModel): void {
    this.model = model;
  }

  getController(): never {
    throw new NotImplementedError('MatchBroadcastView.getController is not applicable');
  }

  setController(): void {
    throw new NotImplementedError('MatchBroadcastView.setController is not applicable');
  }

  /** Switches on event.type to emit champion:selected / match:start / match:state / match:end / match:player_disconnected / match:player_reconnected. */
  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchBroadcastView.modelChanged not yet implemented');
  }
}
```

### 3. `ServerMain.ts`
```ts
import { NotImplementedError } from '@arena/shared';

export class ServerMain {
  /** Creates the HTTP + Socket.IO server, MatchmakingQueue, TickLoop; wires ConnectionHandler per connection; starts TickLoop; listens. */
  static async main(): Promise<void> {
    throw new NotImplementedError('ServerMain.main not yet implemented');
  }
}
```

### 4. `index.ts`
```ts
import { ServerMain } from './ServerMain';

ServerMain.main().catch((err) => {
  console.error('Arena server failed to start:', err);
  process.exit(1);
});
```

---

### 5. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` succeeds. Branch `server`, commit
`Step 2: server view package and ServerMain entry point`, push, then **open a PR merging `server` into
`main`** — server's Step 2 skeleton is now complete.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `getController()`/`setController()` being not-applicable on both broadcast views is a known,
reviewed simplification (these are pure observers with no paired controller) — do not force a fake
controller pairing just to avoid the stub.**
