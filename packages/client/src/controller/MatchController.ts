import { AbstractController, NotImplementedError } from '@arena/shared';

/**
 * Handles in-combat player input during the COMBAT phase (R4.1–R4.6).
 * Translates UI events (keyboard, pointer) into server action requests; applies client-side
 * input throttling so the socket is not flooded at the render frame rate.
 */
export class MatchController extends AbstractController {
  /**
   * Throttles and forwards a combat action to the server.
   * Supported actions: 'move' (directional input), 'useAbility' (ability slot activation).
   * The server validates cooldowns, resource costs, and phase legality before applying any effect
   * (R4.1) — this controller never asserts an outcome.
   * @param action - 'move' or 'useAbility'
   * @param payload - action-specific data (e.g. target position for move, abilityId for useAbility)
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchController.operation not yet implemented');
  }
}
