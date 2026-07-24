import { NotImplementedError } from '@arena/shared';

/**
 * Application entry point for the Arena client. Constructs the full model/controller/view graph
 * and mounts the React root onto the DOM (SRS 2.1, R-D7).
 */
export class ClientMain {
  /**
   * Instantiates all models, controllers, and views; wires them together; and mounts the React
   * root with the screen router as the top-level component.
   */
  static main(): void {
    throw new NotImplementedError('ClientMain.main not yet implemented');
  }
}
