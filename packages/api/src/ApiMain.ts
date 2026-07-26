import { NotImplementedError } from '@arena/shared';

/** Entry point for the `packages/api` subsystem (R-D4 — builds and runs as an independent container). */
export class ApiMain {
  /**
   * Builds the Express app, wires middleware and the three controllers to routes, connects `PgPool`, and
   * listens on the configured port.
   */
  static async main(): Promise<void> {
    throw new NotImplementedError('ApiMain.main not yet implemented');
  }
}
