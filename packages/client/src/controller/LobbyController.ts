import { AbstractController, NotImplementedError } from '@arena/shared';

export class LobbyController extends AbstractController {
  /** Client-side non-empty/≤24-char check mirroring R1.1 before delegating to SocketConnectionController. */
  operation(action: string, payload?: { username: string }): void {
    throw new NotImplementedError('LobbyController.operation not yet implemented');
  }
}
