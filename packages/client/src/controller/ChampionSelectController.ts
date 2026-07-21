import { AbstractController, NotImplementedError } from '@arena/shared';

export class ChampionSelectController extends AbstractController {
  operation(action: string, payload?: { championId: string }): void {
    throw new NotImplementedError('ChampionSelectController.operation not yet implemented');
  }
}
