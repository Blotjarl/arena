# Prompt 02_shared_3 — Domain Vocabulary and Wire Contract

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm `02_shared_2` is merged.** This prompt fills in
`packages/shared/src/domain/` (14 files, `docs/01_class_list.md` §2) and `packages/shared/src/contract/`
(3 files, §3). Every type here is data — constructors and trivial accessors only; the one real method
(`Position.distanceTo`) and the two `ChampionRoster` statics are stubbed like everything else in Step 2.

---

### MANDATORY: Sandwich Requirement
- **Start**: files exist as empty placeholders from `02_shared_1`.
- **End**: `docs/01_class_list.md` §2–3 match these files; no file in `domain/` imports from `contract/`
  or vice versa in a way that creates a cycle (contract depends on domain, never the reverse).

---

### 1. Domain — enums (trivial, no stubs needed)

**`domain/ids.ts`**
```ts
export type PlayerId = string;
export type MatchId = string;
export type ChampionId = string;
```

**`domain/Team.ts`**
```ts
export enum Team { A = 'A', B = 'B' }
```

**`domain/MatchPhase.ts`**
```ts
export enum MatchPhase { CHAMPION_SELECT = 'CHAMPION_SELECT', ACTIVE = 'ACTIVE', ENDED = 'ENDED' }
```

**`domain/ConnectionStatus.ts`**
```ts
export enum ConnectionStatus { CONNECTED = 'CONNECTED', DISCONNECTED = 'DISCONNECTED' }
```

**`domain/EndReason.ts`**
```ts
export enum EndReason {
  ELIMINATION = 'ELIMINATION',
  TIME_LIMIT = 'TIME_LIMIT',
  DISCONNECT_FORFEIT = 'DISCONNECT_FORFEIT',
  SELECTION_TIMEOUT = 'SELECTION_TIMEOUT',
}
```

**`domain/MatchResult.ts`**
```ts
export enum MatchResult { WIN = 'WIN', LOSS = 'LOSS', DRAW = 'DRAW' }
```

**`domain/EffectType.ts`**
```ts
export enum EffectType { DAMAGE = 'DAMAGE', HEAL = 'HEAL', CROWD_CONTROL = 'CROWD_CONTROL', POSITIONING = 'POSITIONING' }
```

### 2. Domain — classes

**`domain/Position.ts`**
```ts
import { NotImplementedError } from '../util/NotImplementedError';

export class Position {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  distanceTo(other: Position): number {
    throw new NotImplementedError('Position.distanceTo not yet implemented');
  }
}
```

**`domain/Ability.ts`**
```ts
import { EffectType } from './EffectType';

export class Ability {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly cooldownSeconds: number,
    public readonly resourceCost: number,
    public readonly range: number,
    public readonly effectType: EffectType,
    public readonly magnitude: number,
  ) {}
}
```

**`domain/Champion.ts`**
```ts
import { ChampionId } from './ids';
import { Ability } from './Ability';
import { NotImplementedError } from '../util/NotImplementedError';

export class Champion {
  constructor(
    public readonly id: ChampionId,
    public readonly name: string,
    public readonly role: string,
    public readonly maxHealth: number,
    public readonly maxResource: number,
    public readonly resourceRegenRate: number,
    public readonly moveSpeed: number,
    public readonly abilities: Ability[],
  ) {}

  /** @throws InvalidChampionSelectionError if abilityId is not one of this champion's abilities. */
  getAbility(abilityId: string): Ability {
    throw new NotImplementedError('Champion.getAbility not yet implemented');
  }
}
```

**`domain/ChampionRoster.ts`**
```ts
import { ChampionId } from './ids';
import { Champion } from './Champion';
import { NotImplementedError } from '../util/NotImplementedError';

/** The fixed three-champion roster — Korr, Vex, Rin (docs/01_class_list.md §1.4 / SRS Appendix B). */
export class ChampionRoster {
  private static readonly champions: Champion[] = [];

  static getAll(): Champion[] {
    throw new NotImplementedError('ChampionRoster.getAll not yet implemented');
  }

  /** @throws InvalidChampionSelectionError if id is not a known champion. */
  static getById(id: ChampionId): Champion {
    throw new NotImplementedError('ChampionRoster.getById not yet implemented');
  }
}
```

**`domain/Player.ts`**
```ts
import { PlayerId } from './ids';

export class Player {
  constructor(
    public readonly id: PlayerId,
    public readonly username: string,
    public readonly createdAt: Date,
  ) {}
}
```

**`domain/Match.ts`**
```ts
import { MatchId } from './ids';
import { EndReason } from './EndReason';
import { Team } from './Team';

export class Match {
  constructor(
    public readonly id: MatchId,
    public readonly endReason: EndReason,
    public readonly winningTeam: Team | null,
    public readonly durationMs: number,
    public readonly endedAt: Date,
  ) {}
}
```

**`domain/MatchParticipant.ts`**
```ts
import { MatchId, PlayerId, ChampionId } from './ids';
import { Team } from './Team';
import { MatchResult } from './MatchResult';

export class MatchParticipant {
  constructor(
    public readonly matchId: MatchId,
    public readonly playerId: PlayerId,
    public readonly team: Team,
    public readonly championId: ChampionId,
    public readonly result: MatchResult,
  ) {}
}
```

---

### 3. Contract — grouped by direction, not one file per payload

`docs/01_class_list.md` §3 lists 17 individual DTO types; consolidate them into three files by direction
(matching the old prototype's `contract/dto.ts` / `events.ts` / `payloads.ts` split) rather than 17
one-line files — this is a deliberate simplification from the class list, not an omission.

**`contract/payloads.ts`** (client → server)
```ts
import { PlayerId } from '../domain/ids';
import { Position } from '../domain/Position';

export interface IdentifyPayload {
  playerId: PlayerId;
  username: string;
}

export interface MovementInput {
  dx: number;
  dy: number;
}

export interface AbilityUseRequest {
  abilityId: string;
  targetPlayerId?: PlayerId;
  targetPosition?: Position;
}
```

**`contract/events.ts`** (server → client)
```ts
import { MatchId, PlayerId, ChampionId } from '../domain/ids';
import { Team } from '../domain/Team';
import { EndReason } from '../domain/EndReason';
import { ConnectionStatus } from '../domain/ConnectionStatus';
import { Champion } from '../domain/Champion';
import { Position } from '../domain/Position';

export interface QueueJoinedPayload {
  position: number;
}

export type QueueCancelledPayload = Record<string, never>;

export interface MatchFoundPayload {
  matchId: MatchId;
  team: Team;
  opponentUsername: string;
  roster: Champion[];
}

export interface ChampionSelectedPayload {
  matchId: MatchId;
  playerId: PlayerId;
  championId: ChampionId;
  bothSelected: boolean;
}

export interface ParticipantSnapshot {
  playerId: PlayerId;
  team: Team;
  championId: ChampionId;
  position: Position;
  health: number;
  resource: number;
  cooldownsRemaining: Record<string, number>;
  crowdControlled: boolean;
  connectionStatus: ConnectionStatus;
  alive: boolean;
}

export interface MatchStatePayload {
  matchId: MatchId;
  tick: number;
  participants: [ParticipantSnapshot, ParticipantSnapshot];
}

export interface MatchStartPayload {
  matchId: MatchId;
  initialState: MatchStatePayload;
}

export interface MatchEndPayload {
  matchId: MatchId;
  reason: EndReason;
  winningTeam: Team | null;
  durationMs: number;
}

export interface PlayerDisconnectedPayload {
  playerId: PlayerId;
  gracePeriodSeconds: number;
}

export interface PlayerReconnectedPayload {
  playerId: PlayerId;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

/**
 * Event name constants — not in docs/01_class_list.md, added here to prevent magic-string drift between
 * server and client (both import this instead of retyping 'match:state' etc.). Values match SRS Appendix A.
 */
export const SOCKET_EVENTS = {
  IDENTIFY: 'identify',
  QUEUE_JOIN: 'queue:join',
  QUEUE_CANCEL: 'queue:cancel',
  CHAMPION_SELECT: 'champion:select',
  MATCH_ACTION: 'match:action',
  MATCH_RECONNECT: 'match:reconnect',
  QUEUE_JOINED: 'queue:joined',
  QUEUE_CANCELLED: 'queue:cancelled',
  MATCH_FOUND: 'match:found',
  CHAMPION_SELECTED: 'champion:selected',
  MATCH_START: 'match:start',
  MATCH_STATE: 'match:state',
  MATCH_END: 'match:end',
  MATCH_PLAYER_DISCONNECTED: 'match:player_disconnected',
  MATCH_PLAYER_RECONNECTED: 'match:player_reconnected',
  ERROR: 'error',
} as const;
```

**`contract/dto.ts`** (REST)
```ts
import { MatchId, ChampionId } from '../domain/ids';
import { EndReason } from '../domain/EndReason';
import { MatchResult } from '../domain/MatchResult';

export interface MatchHistoryEntryDTO {
  matchId: MatchId;
  opponentUsername: string;
  championId: ChampionId;
  result: MatchResult;
  endReason: EndReason;
  durationMs: number;
  endedAt: string;
}

export interface LeaderboardEntryDTO {
  username: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  winRate: number;
}

export interface ChampionWinRateDTO {
  championId: ChampionId;
  gamesPlayed: number;
  winRate: number;
}
```

---

### 4. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/shared` succeeds. Branch `shared`, commit
`Step 2: shared domain vocabulary and wire contract`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: `docs/01_class_list.md` §3's 17 individual DTO names still all exist — as exported interfaces
inside `payloads.ts`/`events.ts`/`dto.ts` — just consolidated into 3 files instead of 17. Note this
consolidation in your commit message so it isn't mistaken for a missing type later.**
