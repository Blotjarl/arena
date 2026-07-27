import { ArenaError } from '@arena/shared';

/**
 * Formats a caught `ArenaError` into an HTTP status code and JSON error body. A plain formatter, not a
 * `View` implementer — a synchronous HTTP response has no push/observe relationship to establish.
 */
export class ErrorResponseView {
  /**
   * Maps a domain exception's `code` to an HTTP status. Codes not listed here (exceptions that can only
   * originate in `packages/server`'s socket-side validation, never thrown by anything `packages/api`
   * calls) fall back to 500 — an unmapped code reaching this view is itself a defect, not a client error.
   */
  private static readonly STATUS_BY_CODE: Record<string, number> = {
    VALIDATION_ERROR: 400,
    PLAYER_NOT_FOUND: 404,
    PERSISTENCE_ERROR: 500,
  };

  /**
   * @param error - the domain exception caught while handling a request
   * @returns the HTTP status and JSON body to send in response
   */
  render(error: ArenaError): { status: number; body: { code: string; message: string } } {
    const status = ErrorResponseView.STATUS_BY_CODE[error.code] ?? 500;
    return { status, body: { code: error.code, message: error.message } };
  }
}
