import { NotImplementedError } from '@arena/shared';

export class ApiMain {
  /** Builds the Express app, wires middleware and the three controllers to routes, connects PgPool, listens. */
  static async main(): Promise<void> {
    throw new NotImplementedError('ApiMain.main not yet implemented');
  }
}
