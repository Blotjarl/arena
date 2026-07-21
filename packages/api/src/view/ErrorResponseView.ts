import { ArenaError, NotImplementedError } from '@arena/shared';

export class ErrorResponseView {
  render(error: ArenaError): { status: number; body: { code: string; message: string } } {
    throw new NotImplementedError('ErrorResponseView.render not yet implemented');
  }
}
