/**
 * Base class for every domain exception in Arena. Carries a stable, machine-readable `code` so the
 * WebSocket `error` event and REST error responses can key off failure type without string-matching
 * `message`.
 */
export abstract class ArenaError extends Error {
  abstract readonly code: string;

  /** @param message - human-readable description, suitable for display or logging */
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
