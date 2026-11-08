import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OutboxEvent, Prisma, QaRun } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleScope } from './console-scope';

/**
 * OUTBOUND WEBHOOKS (n8n-ready). One URL (N8N_WEBHOOK_URL) receives every event; n8n branches on `event`.
 *
 *   POST <N8N_WEBHOOK_URL>
 *   Content-Type: application/json
 *   X-BMStore-Event: store.created | intake.completed | qa.result | store.live | renewal.due
 *   X-BMStore-Delivery: <event id>          (same id on retries: dedupe on it in n8n)
 *   X-BMStore-Timestamp: <unix seconds>
 *   X-BMStore-Signature: sha256=<hex HMAC-SHA256(WEBHOOK_SECRET, "<timestamp>.<raw body>")>
 *
 *   { "id", "event", "occurredAt", "store": { id, name, subdomain, url, status }, "contact": { ownerName, whatsapp, email }, "data": { ... } }
 *
 * Every event is recorded in outbox_events first (kind=webhook). No URL configured => status "skipped" (still
 * recorded, can be redelivered later). Delivery runs on the BullMQ worker with retries when jobs are on; otherwise
 * one inline attempt. Payloads never contain secrets, keys or passwords.
 */
export const WEBHOOK_EVENTS = ['store.created', 'intake.completed', 'qa.result', 'store.live', 'renewal.due'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const MAX_WEBHOOK_ATTEMPTS = 6;

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

@Injectable()
export class WebhookService {
  private readonly log = new Logger('Webhooks');
  /** Set by the jobs scheduler when BullMQ runs: hands delivery to the worker (with retries). */
  private enqueue?: (eventId: string, tenantId: string) => Promise<void>;

  constructor(private readonly prisma: PrismaService, private readonly scope: ConsoleScope, private readonly cfg: AppConfig) {}
  private get db() { return this.prisma.db; }

  useQueue(fn: (eventId: string, tenantId: string) => Promise<void>) { this.enqueue = fn; }

  async emit(tenantId: string, event: WebhookEvent, data: Record<string, unknown>, dedupeKey?: string): Promise<OutboxEvent | null> {
    const row = await this.scope.asTenant(tenantId, async () => {
      const t = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const intake = await this.db.storeIntake.findUnique({ where: { tenantId }, select: { ownerName: true, whatsapp: true, email: true } });
      const occurredAt = new Date();
      const body = {
        event, occurredAt: occurredAt.toISOString(),
        store: { id: t.id, name: t.name, subdomain: t.subdomain, url: this.scope.storeUrl(t), status: t.status },
        contact: { ownerName: intake?.ownerName ?? null, whatsapp: t.whatsappNumber ?? intake?.whatsapp ?? null, email: intake?.email ?? null },
        data,
      };
      if (dedupeKey) {
        const made = await this.db.outboxEvent.createMany({ data: [{ tenantId, kind: 'webhook', event, dedupeKey, payload: body as Prisma.InputJsonValue, status: this.cfg.n8nWebhookUrl ? 'pending' : 'skipped' }], skipDuplicates: true });
        if (!made.count) return null;
        return this.db.outboxEvent.findFirstOrThrow({ where: { dedupeKey } });
      }
      return this.db.outboxEvent.create({ data: { tenantId, kind: 'webhook', event, payload: body as Prisma.InputJsonValue, status: this.cfg.n8nWebhookUrl ? 'pending' : 'skipped' } });
    });
    if (!row || row.status === 'skipped') return row;
    if (this.enqueue) await this.enqueue(row.id, tenantId).catch((e) => this.log.warn(`enqueue failed: ${e?.message}`));
    else await this.deliver(row.id, tenantId);
    return row;
  }

  /** One delivery attempt. Throws on failure when `throwOnFail` (so BullMQ retries); otherwise records and returns. */
  async deliver(eventId: string, tenantId: string, throwOnFail = false): Promise<OutboxEvent> {
    const url = this.cfg.n8nWebhookUrl;
    const row = await this.scope.asTenant(tenantId, () => this.db.outboxEvent.findUnique({ where: { id: eventId } }));
    if (!row || row.kind !== 'webhook') throw new NotFoundException('Webhook event not found');
    if (row.status === 'sent') return row;
    if (!url) return this.scope.asTenant(tenantId, () => this.db.outboxEvent.update({ where: { id: eventId }, data: { status: 'skipped', lastError: 'N8N_WEBHOOK_URL not set' } }));

    const body = JSON.stringify({ id: row.id, ...(row.payload as object) });
    const ts = Math.floor(Date.now() / 1000);
    const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'BMStore-Webhooks/1', 'x-bmstore-event': row.event, 'x-bmstore-delivery': row.id, 'x-bmstore-timestamp': String(ts) };
    if (this.cfg.webhookSecret) headers['x-bmstore-signature'] = signWebhook(this.cfg.webhookSecret, ts, body);
    let error: string | null = null;
    try {
      const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) error = `HTTP ${r.status}`;
    } catch (e: any) {
      error = e?.name === 'TimeoutError' ? 'timed out' : 'network error';
    }
    const updated = await this.scope.asTenant(tenantId, () =>
      this.db.outboxEvent.update({ where: { id: eventId }, data: { attempts: { increment: 1 }, status: error ? 'failed' : 'sent', sentAt: error ? null : new Date(), lastError: error } }),
    );
    if (error) {
      this.log.warn(`webhook ${row.event} attempt ${updated.attempts} failed: ${error}`); // URL never logged (may hold a token)
      if (throwOnFail && updated.attempts < MAX_WEBHOOK_ATTEMPTS) throw new Error(`webhook delivery failed: ${error}`);
    }
    return updated;
  }

  /** Console: a store's notifications and webhooks, newest first. */
  list(tenantId: string, take = 50) {
    return this.scope.asTenant(tenantId, () => this.db.outboxEvent.findMany({ orderBy: { createdAt: 'desc' }, take }));
  }

  // ---- the five events ---------------------------------------------------------------------------------------
  storeCreated(tenantId: string) { return this.emit(tenantId, 'store.created', {}, 'wh-store-created'); }
  intakeCompleted(tenantId: string, completedAt: Date | null) { return this.emit(tenantId, 'intake.completed', { completedAt: completedAt?.toISOString() ?? null }, 'wh-intake-completed'); }
  qaResult(tenantId: string, run: QaRun) {
    const results = (run.results as any[]) ?? [];
    return this.emit(tenantId, 'qa.result', {
      runId: run.id, passed: run.passed, failed: results.filter((r) => r.status === 'fail').map((r) => ({ id: r.id, label: r.label, detail: r.detail })),
      skipped: results.filter((r) => r.status === 'skipped').map((r) => r.id), finishedAt: run.finishedAt?.toISOString() ?? null,
    });
  }
  wentLive(tenantId: string, wentLiveAt: Date | null, expiresAt: Date | null) {
    return this.emit(tenantId, 'store.live', { wentLiveAt: wentLiveAt?.toISOString() ?? null, expiresAt: expiresAt?.toISOString() ?? null }, `wh-live-${wentLiveAt?.toISOString() ?? 'x'}`);
  }
  renewalDue(tenantId: string, day: number, expiresAt: Date) {
    return this.emit(tenantId, 'renewal.due', { planDay: day, expiresAt: expiresAt.toISOString(), daysLeft: Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) }, `wh-renewal-${day}-${expiresAt.toISOString().slice(0, 10)}`);
  }
}
