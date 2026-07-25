import { ArenaError } from './ArenaError';

/** Thrown when an ability's requested target is farther away than the ability's range allows (R4.2). */
export class TargetOutOfRangeError extends ArenaError {
  readonly code = 'TARGET_OUT_OF_RANGE';

  /**
   * @param abilityId - the ability that was used
   * @param range - the ability's maximum range
   * @param distance - the actual distance to the requested target
   */
  constructor(abilityId: string, range: number, distance: number) {
    super(`Ability "${abilityId}" has range ${range}, target is ${distance.toFixed(1)} away.`);
  }
}
