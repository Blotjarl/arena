import { ArenaError } from './ArenaError';

export class TargetOutOfRangeError extends ArenaError {
  readonly code = 'TARGET_OUT_OF_RANGE';
  constructor(abilityId: string, range: number, distance: number) {
    super(`Ability "${abilityId}" has range ${range}, target is ${distance.toFixed(1)} away.`);
  }
}
