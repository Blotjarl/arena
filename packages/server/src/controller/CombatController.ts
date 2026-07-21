import { AbstractController, NotImplementedError } from '@arena/shared';

export class CombatController extends AbstractController {
  /** R4.1, R4.2 — a validation failure is swallowed per spec, not surfaced as an exception to the player. */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('CombatController.operation not yet implemented');
  }
}
