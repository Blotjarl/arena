import { NotImplementedError } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { ClientMatchModel } from '../model/ClientMatchModel';

/** Typed bundle of the three client models that SocketConnectionController routes events into. */
export interface ClientModels {
  identity: ClientIdentityModel;
  queue: ClientQueueModel;
  match: ClientMatchModel;
}

/**
 * Thin adapter that owns the Socket.IO client connection: emits outbound action payloads and
 * routes inbound server events to the corresponding model's apply*() method (2.3, R-D2).
 * This class is intentionally kept as a shallow adapter — all business logic lives in the models
 * and domain controllers, not here. See master context §4.2 (testability without a live socket).
 */
export class SocketConnectionController {
  /**
   * @param models - the three client models that inbound server events are dispatched into
   */
  constructor(private readonly models: ClientModels) {}

  /**
   * Emits a named action to the server over the Socket.IO connection.
   * If the socket is not currently connected (e.g. mid-disconnect), the emit is a no-op at the
   * Socket.IO layer; the caller will not receive an error. Reconnect handling and graceful
   * degradation during a disconnect are not yet implemented — this stub will be extended in Step 8
   * to surface connection-state errors to the UI via the identity model (R6.1).
   * @param action - the Socket.IO event name to emit (e.g. 'identity:submit', 'queue:join')
   * @param payload - optional data to attach to the event
   */
  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('SocketConnectionController.operation not yet implemented');
  }

  /**
   * Registers listeners for all inbound server events and dispatches each to the matching
   * model's apply*() method. Called once during initialisation; must not be called again.
   */
  private bindInboundEvents(): void {
    throw new NotImplementedError('SocketConnectionController.bindInboundEvents not yet implemented');
  }
}
