import { ArenaError } from './ArenaError';

/** Thrown when a player attempts to use an ability without enough resource to pay its cost (R4.2). */
export class InsufficientResourceError extends ArenaError {
  readonly code = 'INSUFFICIENT_RESOURCE';

  /**
   * @param abilityId - the ability whose cost couldn't be paid
   * @param required - the resource amount the ability costs
   * @param available - the resource amount the caster actually has
   */
  constructor(abilityId: string, required: number, available: number) {
    super(`Ability "${abilityId}" needs ${required} resource, only ${available} available.`);
  }
}
