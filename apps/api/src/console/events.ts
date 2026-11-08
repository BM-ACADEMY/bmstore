import { Injectable } from '@nestjs/common';

/**
 * Lifecycle events the console raises. Item 8 routes them to outbound n8n webhooks; until then they are no-ops.
 * Kept as one small class so services depend on "an event happened", not on how it is delivered.
 */
@Injectable()
export class ConsoleEvents {
  async storeCreated(_tenantId: string): Promise<void> {}
  async intakeCompleted(_tenantId: string): Promise<void> {}
}
