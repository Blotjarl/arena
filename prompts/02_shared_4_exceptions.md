# Prompt 02_shared_4 — Exceptions and the Shared Barrel Export

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm `02_shared_2` and `02_shared_3` are merged.** This
prompt fills in `packages/shared/src/exceptions/` (`ArenaError` + 15 subclasses, `docs/01_class_list.md`
§4) and — because this is the last `shared` prompt, with everything else now in place — writes
`packages/shared/src/index.ts`, the barrel export every other package imports from. **Do not deep-import
from `@arena/shared/domain/...` anywhere in `server`/`client`/`api` — always `@arena/shared`.**

---

### MANDATORY: Sandwich Requirement
- **Start**: `exceptions/*.ts` are empty placeholders; `mvc/`, `domain/`, `contract/` are complete
  (`02_shared_2`, `02_shared_3`).
- **End**: `packages/shared/src/index.ts` re-exports every public type in the package; `npm run typecheck
  -w @arena/shared` succeeds; this is the last prompt before `server`/`client`/`api` model work begins.

---

### 1. `exceptions/ArenaError.ts` — the base

```ts
export abstract class ArenaError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

### 2. The 15 subclasses — fully implemented (trivial constructors, not stubbed)

Exception constructors are structural (assign a `code`, build a message), not business logic — implement
them directly, the same way `AbstractModel`'s listener methods were implemented directly in `02_shared_2`.

**`InvalidUsernameError.ts`** — R1.1
```ts
import { ArenaError } from './ArenaError';

export class InvalidUsernameError extends ArenaError {
  readonly code = 'INVALID_USERNAME';
  constructor(username: string) {
    super(`Invalid username: "${username}". Usernames must be 1-24 characters.`);
  }
}
```

**`UnidentifiedConnectionError.ts`** — R1.4
```ts
import { ArenaError } from './ArenaError';

export class UnidentifiedConnectionError extends ArenaError {
  readonly code = 'UNIDENTIFIED_CONNECTION';
  constructor() {
    super('This connection has not sent a valid identify message yet.');
  }
}
```

**`AlreadyQueuedError.ts`** — R2.2
```ts
import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

export class AlreadyQueuedError extends ArenaError {
  readonly code = 'ALREADY_QUEUED';
  constructor(playerId: PlayerId) {
    super(`Player ${playerId} is already queued or in an active match.`);
  }
}
```

**`NotQueuedError.ts`** — R2.3
```ts
import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

export class NotQueuedError extends ArenaError {
  readonly code = 'NOT_QUEUED';
  constructor(playerId: PlayerId) {
    super(`Player ${playerId} is not currently queued.`);
  }
}
```

**`InvalidChampionSelectionError.ts`** — R3.2
```ts
import { ArenaError } from './ArenaError';

export class InvalidChampionSelectionError extends ArenaError {
  readonly code = 'INVALID_CHAMPION_SELECTION';
  constructor(championId: string) {
    super(`"${championId}" is not a champion in the roster.`);
  }
}
```

**`SelectionWindowExpiredError.ts`** — R3.4
```ts
import { ArenaError } from './ArenaError';
import { MatchId } from '../domain/ids';

export class SelectionWindowExpiredError extends ArenaError {
  readonly code = 'SELECTION_WINDOW_EXPIRED';
  constructor(matchId: MatchId) {
    super(`Champion selection window for match ${matchId} has expired.`);
  }
}
```

**`InvalidMatchPhaseError.ts`** — guards R3–R5
```ts
import { ArenaError } from './ArenaError';
import { MatchId } from '../domain/ids';

export class InvalidMatchPhaseError extends ArenaError {
  readonly code = 'INVALID_MATCH_PHASE';
  constructor(matchId: MatchId, expected: string, actual: string) {
    super(`Match ${matchId} expected phase ${expected} but was ${actual}.`);
  }
}
```

**`AbilityOnCooldownError.ts`** — R4.2
```ts
import { ArenaError } from './ArenaError';

export class AbilityOnCooldownError extends ArenaError {
  readonly code = 'ABILITY_ON_COOLDOWN';
  constructor(abilityId: string, remainingSeconds: number) {
    super(`Ability "${abilityId}" is on cooldown for ${remainingSeconds.toFixed(1)}s more.`);
  }
}
```

**`InsufficientResourceError.ts`** — R4.2
```ts
import { ArenaError } from './ArenaError';

export class InsufficientResourceError extends ArenaError {
  readonly code = 'INSUFFICIENT_RESOURCE';
  constructor(abilityId: string, required: number, available: number) {
    super(`Ability "${abilityId}" needs ${required} resource, only ${available} available.`);
  }
}
```

**`ActorIncapacitatedError.ts`** — R4.2, R6.1
```ts
import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

export class ActorIncapacitatedError extends ArenaError {
  readonly code = 'ACTOR_INCAPACITATED';
  constructor(playerId: PlayerId, reason: 'dead' | 'crowd-controlled') {
    super(`Player ${playerId} cannot act — ${reason}.`);
  }
}
```

**`TargetOutOfRangeError.ts`** — R4.2
```ts
import { ArenaError } from './ArenaError';

export class TargetOutOfRangeError extends ArenaError {
  readonly code = 'TARGET_OUT_OF_RANGE';
  constructor(abilityId: string, range: number, distance: number) {
    super(`Ability "${abilityId}" has range ${range}, target is ${distance.toFixed(1)} away.`);
  }
}
```

**`GracePeriodExpiredError.ts`** — R6.4
```ts
import { ArenaError } from './ArenaError';
import { PlayerId, MatchId } from '../domain/ids';

export class GracePeriodExpiredError extends ArenaError {
  readonly code = 'GRACE_PERIOD_EXPIRED';
  constructor(playerId: PlayerId, matchId: MatchId) {
    super(`Player ${playerId}'s reconnect grace period for match ${matchId} has expired.`);
  }
}
```

**`PlayerNotFoundError.ts`** — general
```ts
import { ArenaError } from './ArenaError';
import { PlayerId } from '../domain/ids';

export class PlayerNotFoundError extends ArenaError {
  readonly code = 'PLAYER_NOT_FOUND';
  constructor(playerId: PlayerId) {
    super(`No player found with id ${playerId}.`);
  }
}
```

**`PersistenceError.ts`** — R7.4, R-DB4
```ts
import { ArenaError } from './ArenaError';

export class PersistenceError extends ArenaError {
  readonly code = 'PERSISTENCE_ERROR';
  constructor(operation: string, cause?: unknown) {
    super(`Persistence operation "${operation}" failed${cause ? `: ${String(cause)}` : '.'}`);
  }
}
```

**`ValidationError.ts`** — 3.6.2
```ts
import { ArenaError } from './ArenaError';

export class ValidationError extends ArenaError {
  readonly code = 'VALIDATION_ERROR';
  constructor(field: string, reason: string) {
    super(`Invalid ${field}: ${reason}`);
  }
}
```

### 3. `exceptions/index.ts` — barrel for this subfolder
```ts
export * from './ArenaError';
export * from './InvalidUsernameError';
export * from './UnidentifiedConnectionError';
export * from './AlreadyQueuedError';
export * from './NotQueuedError';
export * from './InvalidChampionSelectionError';
export * from './SelectionWindowExpiredError';
export * from './InvalidMatchPhaseError';
export * from './AbilityOnCooldownError';
export * from './InsufficientResourceError';
export * from './ActorIncapacitatedError';
export * from './TargetOutOfRangeError';
export * from './GracePeriodExpiredError';
export * from './PlayerNotFoundError';
export * from './PersistenceError';
export * from './ValidationError';
```

---

### 4. `packages/shared/src/index.ts` — the package barrel

```ts
// MVC framework
export * from './mvc/Model';
export * from './mvc/View';
export * from './mvc/Controller';
export * from './mvc/ModelEvent';
export * from './mvc/ModelListener';
export * from './mvc/AbstractModel';
export * from './mvc/AbstractController';

// Domain
export * from './domain/ids';
export * from './domain/Team';
export * from './domain/MatchPhase';
export * from './domain/ConnectionStatus';
export * from './domain/EndReason';
export * from './domain/MatchResult';
export * from './domain/EffectType';
export * from './domain/Position';
export * from './domain/Ability';
export * from './domain/Champion';
export * from './domain/ChampionRoster';
export * from './domain/Player';
export * from './domain/Match';
export * from './domain/MatchParticipant';

// Contract
export * from './contract/payloads';
export * from './contract/events';
export * from './contract/dto';

// Exceptions
export * from './exceptions';

// Util
export * from './util/NotImplementedError';
```

---

### 5. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/shared` succeeds; every file has content now
except nothing — `packages/shared` is functionally complete for skeleton purposes. Branch `shared`, commit
`Step 2: shared exceptions and package barrel export`, push, then **open a PR merging `shared` into
`main`** — per master context §9.4, `shared` merges promptly because `server`, `client`, and `api` are all
blocked on it.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: Do not begin `02_server_1`, `02_client_1`, or `02_api_1` until this prompt's branch is merged
to `main` and those three packages' code branches from the merged `main`, not from `shared` directly.**
