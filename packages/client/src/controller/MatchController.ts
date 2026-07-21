import { AbstractController, NotImplementedError } from '@arena/shared';

export class MatchController extends AbstractController {
  /** Throttles/sends match:action for 'move' | 'useAbility'. */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('MatchController.operation not yet implemented');
  }
}
