/**
 * Thrown by every stub method body during the skeleton/declaration phase
 * (docs/ProjectProcess.txt Steps 2–3). Not a domain exception — does not
 * extend ArenaError, and should not appear in the codebase once a method's
 * real implementation lands (Steps 8–10).
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotImplementedError';
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
