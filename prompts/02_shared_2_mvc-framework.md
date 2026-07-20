# Prompt 02_shared_2 — MVC Framework Declarations

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md` and confirm `02_shared_1` has been merged (the empty
files below already exist) before proceeding.** This prompt fills in the seven files under
`packages/shared/src/mvc/` — the reusable framework every subsystem builds on. **MANDATORY**: unlike most
Step 2 prompts, the structural methods here (listener add/remove/notify, getter/setter pairs) are fully
implemented, not stubbed — they are bookkeeping, not domain business logic, exactly as the course's
Calculator/Account Manager examples fully implement `AbstractModel`/`AbstractController` at this same stage.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/shared/src/mvc/*.ts` exist as empty placeholders (from `02_shared_1`).
- **End**: `docs/01_class_list.md` §1 matches these files exactly — same members, same signatures.

---

### 1. `mvc/Model.ts`
```ts
import { ModelEvent } from './ModelEvent';

export interface Model {
  notifyChanged(event: ModelEvent): void;
}
```

### 2. `mvc/ModelListener.ts`
```ts
import { ModelEvent } from './ModelEvent';

export interface ModelListener {
  modelChanged(event: ModelEvent): void;
}
```

### 3. `mvc/ModelEvent.ts`
```ts
import { Model } from './Model';

export class ModelEvent<T = unknown> {
  constructor(
    public readonly source: Model,
    public readonly type: string,
    public readonly payload: T,
    public readonly timestamp: number = Date.now(),
  ) {}
}
```

### 4. `mvc/View.ts`
```ts
import { Model } from './Model';
import { Controller } from './Controller';

export interface View<M extends Model = Model, C extends Controller<M, any> = Controller<M, any>> {
  getModel(): M;
  setModel(model: M): void;
  getController(): C;
  setController(controller: C): void;
}
```

### 5. `mvc/Controller.ts`
```ts
import { Model } from './Model';
import { View } from './View';

export interface Controller<M extends Model = Model, V extends View<M, any> = View<M, any>> {
  getModel(): M;
  setModel(model: M): void;
  getView(): V;
  setView(view: V): void;
}
```
`View` and `Controller` reference each other's generic parameter — this is a valid TypeScript forward
reference for types (no runtime circularity); do not "fix" it by collapsing them into one file.

### 6. `mvc/AbstractModel.ts` — fully implemented, not stubbed
```ts
import { Model } from './Model';
import { ModelEvent } from './ModelEvent';
import { ModelListener } from './ModelListener';

export abstract class AbstractModel implements Model {
  private listeners: ModelListener[] = [];

  addModelListener(listener: ModelListener): void {
    this.listeners.push(listener);
  }

  removeModelListener(listener: ModelListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  notifyChanged(event: ModelEvent): void {
    for (const listener of [...this.listeners]) {
      listener.modelChanged(event);
    }
  }
}
```
The `[...this.listeners]` clone before iterating mirrors the Calculator example's `ArrayList.clone()`
safeguard — a listener that adds/removes itself during notification must not corrupt the iteration.

### 7. `mvc/AbstractController.ts` — fully implemented except the dispatcher
```ts
import { Model } from './Model';
import { View } from './View';
import { Controller } from './Controller';

export abstract class AbstractController<M extends Model = Model, V extends View<M, any> = View<M, any>>
  implements Controller<M, V>
{
  protected model: M;
  protected view: V;

  constructor(model: M, view: V) {
    this.model = model;
    this.view = view;
  }

  getModel(): M {
    return this.model;
  }

  setModel(model: M): void {
    this.model = model;
  }

  getView(): V {
    return this.view;
  }

  setView(view: V): void {
    this.view = view;
  }

  /** MANDATORY: concrete controllers implement this as an if/else or switch dispatcher over `action`. */
  abstract operation(action: string, payload?: unknown): void;
}
```

---

### 8. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/shared` succeeds (only these 7 files have
content — everything else in `shared` still throws on import if referenced, which is expected and fine
since nothing yet imports them). Branch `shared`, commit `Step 2: shared MVC framework declarations`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: No other class in this repository may redefine `Model`, `View`, `Controller`, `ModelEvent`,
`ModelListener`, `AbstractModel`, or `AbstractController`.** Every subsequent prompt imports these from
`@arena/shared`.
