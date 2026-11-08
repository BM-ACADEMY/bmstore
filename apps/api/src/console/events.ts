import { Injectable } from '@nestjs/common';
import type { QaRun } from '@prisma/client';

/**
 * Lifecycle events the console raises. Item 8 routes them to outbound n8n webhooks; until then they are no-ops.
 * Kept as one small class so services depend on "an event happened", not on how it is delivered.
 */
@Injectable()
export class ConsoleEvents {
  async storeCreated(_tenantId: string): Promise<void> {}
  async intakeCompleted(_tenantId: string): Promise<void> {}
  async qaResult(_tenantId: string, _run: QaRun): Promise<void> {}
  async wentLive(_tenantId: string): Promise<void> {}
  async renewalDue(_tenantId: string, _day: number, _expiresAt: Date): Promise<void> {}
}
