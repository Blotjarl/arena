import { ArenaError } from './ArenaError';

/** Thrown when a player attempts to use an ability before its cooldown has elapsed (R4.2). */
export class AbilityOnCooldownError extends ArenaError {
  readonly code = 'ABILITY_ON_COOLDOWN';

  /**
   * @param abilityId - the ability that is still on cooldown
   * @param remainingSeconds - how much longer, in seconds, before it can be used again
   */
  constructor(abilityId: string, remainingSeconds: number) {
    super(`Ability "${abilityId}" is on cooldown for ${remainingSeconds.toFixed(1)}s more.`);
  }
}
