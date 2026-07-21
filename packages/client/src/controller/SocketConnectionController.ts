import { NotImplementedError } from '@arena/shared';
import { ClientIdentityModel } from '../model/ClientIdentityModel';
import { ClientQueueModel } from '../model/ClientQueueModel';
import { ClientMatchModel } from '../model/ClientMatchModel';

export interface ClientModels {
  identity: ClientIdentityModel;
  queue: ClientQueueModel;
  match: ClientMatchModel;
}

/** Owns the Socket.IO client connection; sends outbound requests; routes inbound events into the matching model's apply*() method. */
export class SocketConnectionController {
  constructor(private readonly models: ClientModels) {}

  operation(action: string, payload?: unknown): void {
    throw new NotImplementedError('SocketConnectionController.operation not yet implemented');
  }

  private bindInboundEvents(): void {
    throw new NotImplementedError('SocketConnectionController.bindInboundEvents not yet implemented');
  }
}
