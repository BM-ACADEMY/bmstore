import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Channel, Notifier } from '../notify/notifier';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleScope } from './console-scope';

export interface NoticeInput {
  event: string;
  /** Same (tenant, key) is delivered once, ever. Omit for notices that may repeat. */
  dedupeKey?: string;
  channel: Channel;
  to: string;
  template: string;
  text: string;
  payload?: Record<string, unknown>;
}

/**
 * Records every notification in outbox_events (tenant-scoped, RLS) BEFORE sending it, so a reminder keyed by
 * `dedupeKey` goes out at most once even when a job runs twice or on two workers at the same time.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ConsoleScope, private readonly notifier: Notifier) {}

  /** true = sent now; false = this dedupe key was already sent earlier. */
  async notice(tenantId: string, n: NoticeInput): Promise<boolean> {
    return this.scope.asTenant(tenantId, async () => {
      const db = this.prisma.db;
      const payload = { channel: n.channel, template: n.template, ...(n.payload ?? {}) } as Prisma.InputJsonValue; // never the text: it may carry links
      if (n.dedupeKey) {
        const made = await db.outboxEvent.createMany({ data: [{ tenantId, kind: 'notice', event: n.event, dedupeKey: n.dedupeKey, payload }], skipDuplicates: true });
        if (!made.count) return false;
      } else {
        await db.outboxEvent.create({ data: { tenantId, kind: 'notice', event: n.event, payload } });
      }
      const row = await db.outboxEvent.findFirst({ where: { event: n.event, ...(n.dedupeKey ? { dedupeKey: n.dedupeKey } : {}) }, orderBy: { createdAt: 'desc' } });
      const d = await this.notifier.send({ channel: n.channel, to: n.to, template: n.template, text: n.text, tenantId });
      await db.outboxEvent.update({
        where: { id: row!.id },
        data: { attempts: { increment: 1 }, status: d.delivered ? (d.transport === 'stub' ? 'stubbed' : 'sent') : 'failed', sentAt: d.delivered ? new Date() : null, lastError: d.delivered ? null : (d.detail ?? 'not delivered') },
      });
      return true;
    });
  }
}
