import { ArenaError } from './ArenaError';

export class AbilityOnCooldownError extends ArenaError {
  readonly code = 'ABILITY_ON_COOLDOWN';
  constructor(abilityId: string, remainingSeconds: number) {
    super(`Ability "${abilityId}" is on cooldown for ${remainingSeconds.toFixed(1)}s more.`);
  }
}
