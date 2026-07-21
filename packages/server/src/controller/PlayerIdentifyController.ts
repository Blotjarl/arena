import { AbstractController, NotImplementedError } from '@arena/shared';
import { IdentifyPayload } from '@arena/shared';

export class PlayerIdentifyController extends AbstractController {
  /** @throws InvalidUsernameError */
  operation(action: string, payload?: IdentifyPayload): void {
    throw new NotImplementedError('PlayerIdentifyController.operation not yet implemented');
  }
}
