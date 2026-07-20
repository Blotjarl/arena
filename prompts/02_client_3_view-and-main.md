# Prompt 02_client_3 — Client View Package and Entry Point

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm `02_client_2` (client controllers) is merged.**
This prompt fills in `packages/client/src/view/`, `ClientMain.tsx`, and `index.tsx`
(`docs/01_class_list.md` §6c–d) — the last client prompt in Step 2. **MANDATORY**: each screen is a class
implementing `View`/`ModelListener` (the MVC-facing object, registers with its model in the constructor)
paired with a functional React component that renders it — the class is not itself JSX.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/client/src/view/*.tsx`, `ClientMain.tsx`, `index.tsx` are empty placeholders;
  client `model/` and `controller/` are complete.
- **End**: `npm run typecheck -w @arena/client` succeeds — this closes out `packages/client`'s Step 2
  skeleton.

---

### 1. `view/LobbyView.tsx`
```tsx
import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { LobbyController } from '../controller/LobbyController';

export class LobbyView implements View, ModelListener {
  private onUpdate: (() => void) | null = null;

  constructor(
    private model: ClientIdentityModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
  }

  /** The paired functional component supplies this so modelChanged can trigger a re-render. */
  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  getModel(): ClientIdentityModel {
    return this.model;
  }

  setModel(model: ClientIdentityModel): void {
    this.model = model;
  }

  getController(): LobbyController {
    return this.controller;
  }

  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('LobbyView.modelChanged not yet implemented');
  }
}

/** Username field, "Find Match" control, queue status/cancel (SRS 3.1.1). */
export function LobbyScreen(props: { view: LobbyView }): JSX.Element {
  throw new NotImplementedError('LobbyScreen render not yet implemented');
}
```

### 2. `view/ChampionSelectView.tsx`
```tsx
import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { ChampionSelectController } from '../controller/ChampionSelectController';

export class ChampionSelectView implements View, ModelListener {
  private onUpdate: (() => void) | null = null;

  constructor(
    private model: ClientMatchModel,
    private controller: ChampionSelectController,
  ) {
    this.model.addModelListener(this);
  }

  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  getModel(): ClientMatchModel {
    return this.model;
  }

  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  getController(): ChampionSelectController {
    return this.controller;
  }

  setController(controller: ChampionSelectController): void {
    this.controller = controller;
  }

  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('ChampionSelectView.modelChanged not yet implemented');
  }
}

/** Both players, selection countdown, roster with stats/abilities (SRS 3.1.1). */
export function ChampionSelectScreen(props: { view: ChampionSelectView }): JSX.Element {
  throw new NotImplementedError('ChampionSelectScreen render not yet implemented');
}
```

### 3. `view/MatchHUDView.tsx`
```tsx
import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { MatchController } from '../controller/MatchController';
import { InterpolationBuffer } from '../model/InterpolationBuffer';

export class MatchHUDView implements View, ModelListener {
  private onUpdate: (() => void) | null = null;
  private readonly interpolation = new InterpolationBuffer(10);

  constructor(
    private model: ClientMatchModel,
    private controller: MatchController,
  ) {
    this.model.addModelListener(this);
  }

  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  getModel(): ClientMatchModel {
    return this.model;
  }

  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  getController(): MatchController {
    return this.controller;
  }

  setController(controller: MatchController): void {
    this.controller = controller;
  }

  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('MatchHUDView.modelChanged not yet implemented');
  }
}

/** Health/resource bars, cooldown indicators, arena rendering via InterpolationBuffer (SRS 3.1.1). */
export function MatchHUDScreen(props: { view: MatchHUDView }): JSX.Element {
  throw new NotImplementedError('MatchHUDScreen render not yet implemented');
}
```

### 4. `view/ResultsView.tsx`
```tsx
import { View, ModelListener, ModelEvent, NotImplementedError } from '@arena/shared';
import { ClientMatchModel } from '../model/ClientMatchModel';
import { LobbyController } from '../controller/LobbyController';

/** "Return to queue" is a lobby action — pairs with LobbyController, not a dedicated results controller (docs/01_class_list.md §6c didn't specify one). */
export class ResultsView implements View, ModelListener {
  private onUpdate: (() => void) | null = null;

  constructor(
    private model: ClientMatchModel,
    private controller: LobbyController,
  ) {
    this.model.addModelListener(this);
  }

  bindUpdateCallback(callback: () => void): void {
    this.onUpdate = callback;
  }

  getModel(): ClientMatchModel {
    return this.model;
  }

  setModel(model: ClientMatchModel): void {
    this.model = model;
  }

  getController(): LobbyController {
    return this.controller;
  }

  setController(controller: LobbyController): void {
    this.controller = controller;
  }

  modelChanged(event: ModelEvent): void {
    throw new NotImplementedError('ResultsView.modelChanged not yet implemented');
  }
}

/** Outcome, reason, duration, return-to-queue control (SRS 3.1.1). */
export function ResultsScreen(props: { view: ResultsView }): JSX.Element {
  throw new NotImplementedError('ResultsScreen render not yet implemented');
}
```

### 5. `ClientMain.tsx`
```tsx
import { NotImplementedError } from '@arena/shared';

export class ClientMain {
  /** Mounts the React root, instantiates the model/controller graph, renders the screen router. */
  static main(): void {
    throw new NotImplementedError('ClientMain.main not yet implemented');
  }
}
```

### 6. `index.tsx`
```tsx
import { ClientMain } from './ClientMain';

ClientMain.main();
```

---

### 7. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/client` succeeds. Branch `client`, commit
`Step 2: client view package and ClientMain entry point`, push, then **open a PR merging `client` into
`main`** — client's Step 2 skeleton is now complete.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `ResultsView` pairing with `LobbyController` instead of a dedicated controller is a
deliberate, documented gap-fill — `docs/01_class_list.md` §6c will be updated to note this in a follow-up
pass, not silently left inconsistent.**
