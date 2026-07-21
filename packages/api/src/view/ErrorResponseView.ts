import { ArenaError, NotImplementedError } from '@arena/shared';

/**
 * Formats a caught `ArenaError` into an HTTP status code and JSON error body. A plain formatter, not a
 * `View` implementer — a synchronous HTTP response has no push/observe relationship to establish.
 */
export class ErrorResponseView {
  /**
   * @param error - the domain exception caught while handling a request
   * @returns the HTTP status and JSON body to send in response
   */
  render(error: ArenaError): { status: number; body: { code: string; message: string } } {
    throw new NotImplementedError('ErrorResponseView.render not yet implemented');
  }
}
