import { AbstractController, NotImplementedError } from '@arena/shared';

export class ChampionSelectController extends AbstractController {
  /** Catches InvalidChampionSelectionError/SelectionWindowExpiredError from the model and asks the view
   *  to emit an `error` payload — never surfaces the raw exception to the socket. */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('ChampionSelectController.operation not yet implemented');
  }
}
