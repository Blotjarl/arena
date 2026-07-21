import { ArenaError } from './ArenaError';

export class InsufficientResourceError extends ArenaError {
  readonly code = 'INSUFFICIENT_RESOURCE';
  constructor(abilityId: string, required: number, available: number) {
    super(`Ability "${abilityId}" needs ${required} resource, only ${available} available.`);
  }
}
