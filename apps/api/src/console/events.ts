import { Injectable, Logger } from '@nestjs/common';
import type { QaRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleScope } from './console-scope';
import { WebhookService } from './webhooks';

/**
 * Lifecycle events the console raises, routed to outbound n8n webhooks. An event never breaks the action that
 * raised it: failures are logged and stay in outbox_events for redelivery.
 */
@Injectable()
export class ConsoleEvents {
  private readonly log = new Logger('ConsoleEvents');
  constructor(private readonly webhooks: WebhookService, private readonly prisma: PrismaService, private readonly scope: ConsoleScope) {}

  private async safe(name: string, fn: () => Promise<unknown>) {
    try { await fn(); } catch (e: any) { this.log.warn(`${name} event not recorded: ${String(e?.message ?? e).slice(0, 200)}`); }
  }

  storeCreated(tenantId: string) { return this.safe('store.created', () => this.webhooks.storeCreated(tenantId)); }
  intakeCompleted(tenantId: string) {
    return this.safe('intake.completed', async () => {
      const i = await this.scope.asTenant(tenantId, () => this.prisma.db.storeIntake.findUnique({ where: { tenantId }, select: { completedAt: true } }));
      await this.webhooks.intakeCompleted(tenantId, i?.completedAt ?? null);
    });
  }
  qaResult(tenantId: string, run: QaRun) { return this.safe('qa.result', () => this.webhooks.qaResult(tenantId, run)); }
  wentLive(tenantId: string) {
    return this.safe('store.live', async () => {
      const t = await this.scope.asTenant(tenantId, () => this.prisma.db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { wentLiveAt: true, expiresAt: true } }));
      await this.webhooks.wentLive(tenantId, t.wentLiveAt, t.expiresAt);
    });
  }
  renewalDue(tenantId: string, day: number, expiresAt: Date) { return this.safe('renewal.due', () => this.webhooks.renewalDue(tenantId, day, expiresAt)); }
}
