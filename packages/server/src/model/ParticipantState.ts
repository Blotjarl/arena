import {
  PlayerId,
  Team,
  Champion,
  Position,
  ConnectionStatus,
  Ability,
  ParticipantSnapshot,
  NotImplementedError,
} from '@arena/shared';

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
