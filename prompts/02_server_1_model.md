# Prompt 02_server_1 — Server Model Package

### CRITICAL DIRECTIVE ###
**CRITICAL: Load `prompts/00_master_context.md`; confirm the `shared` branch has been merged to `main` and
`server` branches from that merged `main`.** This prompt fills in `packages/server/src/model/` — the
authoritative core of the entire system (`docs/01_class_list.md` §5a). **This is the single most important
prompt in Step 2**: per `docs/ProjectProcess.txt` Step 2's own wording, the model package should be
"relatively complete" before controller/view work starts on any track.

---

### MANDATORY: Sandwich Requirement
- **Start**: `packages/server/src/model/*.ts` are empty placeholders; `@arena/shared` is complete and
  installed as a workspace dependency.
- **End**: every real operation (not counting trivial map/array bookkeeping) throws `NotImplementedError`;
  `docs/01_class_list.md` §5a matches these files.

---

### 1. `model/QueueEntry.ts`
```ts
import { PlayerId } from '@arena/shared';

export class QueueEntry {
  constructor(
    public readonly playerId: PlayerId,
    public readonly username: string,
    public readonly joinedAt: number,
  ) {}
}
```

### 2. `model/MatchmakingQueue.ts`
```ts
import { AbstractModel, Player, PlayerId, NotImplementedError } from '@arena/shared';
import { QueueEntry } from './QueueEntry';

export class MatchmakingQueue extends AbstractModel {
  private entries: QueueEntry[] = [];
  private activeMatchCount = 0;

  constructor(private readonly maxConcurrentMatches: number) {
    super();
  }

  /** @throws AlreadyQueuedError if player is already queued or in an active match. Returns 1-based position. */
  join(player: Player): number {
    throw new NotImplementedError('MatchmakingQueue.join not yet implemented');
  }

  /** @throws NotQueuedError if playerId is not currently queued. */
  cancel(playerId: PlayerId): void {
    throw new NotImplementedError('MatchmakingQueue.cancel not yet implemented');
  }

  /** Pairs the two longest-waiting entries if a match slot is free (R2.4, R2.5); null otherwise. */
  tryPairNext(): [QueueEntry, QueueEntry] | null {
    throw new NotImplementedError('MatchmakingQueue.tryPairNext not yet implemented');
  }

  size(): number {
    return this.entries.length;
  }
}
```
`size()` is implemented directly (trivial array access), matching the "structural vs. business logic"
distinction from `02_shared_2` — everything else here has real matchmaking semantics and is stubbed.

### 3. `model/ParticipantState.ts`
```ts
import { PlayerId, Team, Champion, Position, ConnectionStatus, Ability, ParticipantSnapshot, NotImplementedError } from '@arena/shared';

/**
 * Plain class, not an AbstractModel — a participant's state changes are observed through its owning
 * MatchModel, not independently (see docs/01_class_list.md §5a; this class does not itself extend
 * AbstractModel, unlike MatchModel and MatchmakingQueue).
 */
export class ParticipantState {
  public champion: Champion | null = null;
  public position: Position;
  public health = 0;
  public resource = 0;
  private cooldowns: Map<string, number> = new Map();
  private crowdControlledUntil = 0;
  public connectionStatus: ConnectionStatus = ConnectionStatus.CONNECTED;
  public disconnectedAt: number | null = null;

  constructor(
    public readonly playerId: PlayerId,
    public readonly team: Team,
  ) {
    this.position = new Position(0, 0);
  }

  applyDamage(amount: number): void {
    throw new NotImplementedError('ParticipantState.applyDamage not yet implemented');
  }

  applyHeal(amount: number): void {
    throw new NotImplementedError('ParticipantState.applyHeal not yet implemented');
  }

  applyCrowdControl(durationMs: number): void {
    throw new NotImplementedError('ParticipantState.applyCrowdControl not yet implemented');
  }

  /** MANDATORY: called every tick; deposit must eventually call notifyAll-equivalent — see prompts/00_master_context.md §8. */
  regenerateResource(deltaSeconds: number): void {
    throw new NotImplementedError('ParticipantState.regenerateResource not yet implemented');
  }

  canUseAbility(abilityId: string, now: number): boolean {
    throw new NotImplementedError('ParticipantState.canUseAbility not yet implemented');
  }

  /** @throws AbilityOnCooldownError | InsufficientResourceError | ActorIncapacitatedError */
  useAbility(ability: Ability, now: number): void {
    throw new NotImplementedError('ParticipantState.useAbility not yet implemented');
  }

  /** @throws ActorIncapacitatedError if dead or crowd-controlled. */
  move(direction: { dx: number; dy: number }, deltaSeconds: number): void {
    throw new NotImplementedError('ParticipantState.move not yet implemented');
  }

  isAlive(): boolean {
    throw new NotImplementedError('ParticipantState.isAlive not yet implemented');
  }

  toSnapshot(): ParticipantSnapshot {
    throw new NotImplementedError('ParticipantState.toSnapshot not yet implemented');
  }
}
```

### 4. `model/MatchModel.ts`
```ts
import { AbstractModel, MatchId, MatchPhase, EndReason, Team, Player, MatchStatePayload, NotImplementedError } from '@arena/shared';
import { ParticipantState } from './ParticipantState';

export class MatchModel extends AbstractModel {
  public phase: MatchPhase = MatchPhase.CHAMPION_SELECT;
  private participants: [ParticipantState, ParticipantState];
  public championSelectDeadline = 0;
  public startedAt: number | null = null;
  public endedAt: number | null = null;
  public endReason: EndReason | null = null;
  public winningTeam: Team | null = null;

  constructor(
    public readonly id: MatchId,
    players: [Player, Player],
  ) {
    super();
    this.participants = [
      new ParticipantState(players[0].id, Team.A),
      new ParticipantState(players[1].id, Team.B),
    ];
  }

  /** @throws InvalidChampionSelectionError | SelectionWindowExpiredError | InvalidMatchPhaseError */
  selectChampion(playerId: string, championId: string): void {
    throw new NotImplementedError('MatchModel.selectChampion not yet implemented');
  }

  /** @throws InvalidMatchPhaseError */
  submitMove(playerId: string, input: { dx: number; dy: number }): void {
    throw new NotImplementedError('MatchModel.submitMove not yet implemented');
  }

  /** @throws InvalidMatchPhaseError — an invalid ability request is otherwise silently ignored per R4. */
  submitAbility(playerId: string, req: { abilityId: string; targetPlayerId?: string }): void {
    throw new NotImplementedError('MatchModel.submitAbility not yet implemented');
  }

  /** CRITICAL: called by TickLoop 20x/sec — must never throw uncaught (see prompts/00_master_context.md §8). */
  tick(deltaSeconds: number): void {
    throw new NotImplementedError('MatchModel.tick not yet implemented');
  }

  checkWinConditions(): EndReason | null {
    throw new NotImplementedError('MatchModel.checkWinConditions not yet implemented');
  }

  disconnect(playerId: string): void {
    throw new NotImplementedError('MatchModel.disconnect not yet implemented');
  }

  /** @throws GracePeriodExpiredError */
  reconnect(playerId: string): void {
    throw new NotImplementedError('MatchModel.reconnect not yet implemented');
  }

  snapshot(): MatchStatePayload {
    throw new NotImplementedError('MatchModel.snapshot not yet implemented');
  }
}
```

### 5. `model/TickLoop.ts`
```ts
import { MatchId, NotImplementedError } from '@arena/shared';
import { MatchModel } from './MatchModel';

export class TickLoop {
  private matches: Map<MatchId, MatchModel> = new Map();
  private handle: NodeJS.Timeout | null = null;

  constructor(private readonly tickRateHz: number = 20) {}

  register(match: MatchModel): void {
    this.matches.set(match.id, match);
  }

  unregister(matchId: MatchId): void {
    this.matches.delete(matchId);
  }

  start(): void {
    throw new NotImplementedError('TickLoop.start not yet implemented');
  }

  stop(): void {
    throw new NotImplementedError('TickLoop.stop not yet implemented');
  }

  /**
   * CRITICAL CHECKPOINT (prompts/00_master_context.md §8): must wrap each match's tick() in its own
   * try/catch so one match's internal error cannot crash the loop or affect any other match (R5.4, 3.6.2).
   * The stub below intentionally does not yet demonstrate this — Step 3/8 implementation must add it.
   */
  private onTick(): void {
    throw new NotImplementedError('TickLoop.onTick not yet implemented');
  }
}
```
`register`/`unregister` are implemented directly (trivial `Map` operations); `start`/`stop`/`onTick`
involve real timing and error-isolation logic and are stubbed.

---

### 6. Verification and Git
Per master context §9.5/§9.4: `npm run typecheck -w @arena/server` succeeds. Branch `server` from `main`,
commit `Step 2: server model package (matchmaking, match, participant, tick loop)`, push.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: This model package must be reviewed as "relatively complete" (all 5 classes present, all
real operations declared and stubbed) before `02_server_2` (controllers) begins — per
`docs/ProjectProcess.txt` Step 2's explicit ordering.**
