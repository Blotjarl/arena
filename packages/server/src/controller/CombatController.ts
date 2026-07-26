import { AbstractController, NotImplementedError } from '@arena/shared';

/** Handles in-combat movement and ability-use requests during the ACTIVE phase (R4.1–R4.6). */
export class CombatController extends AbstractController {
  /**
   * Dispatches a `match:action` request (movement or ability use) to the underlying MatchModel.
   * Every failure mode this can encounter — an out-of-phase action (InvalidMatchPhaseError) as well as
   * the ability-specific contingencies MatchModel.submitAbility() already catches internally (cooldown,
   * resource, incapacitation, range, R4.2) — is caught here and swallowed rather than surfaced as an
   * exception to the player: an invalid action simply has no effect, per R4's "silently ignores" behavior.
   * @param action - the combat action, e.g. 'match:action'
   * @param payload - movement input or an ability-use request
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('CombatController.operation not yet implemented');
  }
}
