import { Injectable } from '@nestjs/common';
import { Prisma, QaRun } from '@prisma/client';
import { AuthActor } from '../common/request-context';
import { TenantSecretsService } from '../crypto/tenant-secrets.service';
import { Notifier } from '../notify/notifier';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleScope } from './console-scope';
import { DomainService } from './domain.service';
import { ConsoleEvents } from './events';
import { TlsProbe } from './net-probes';
import { REQUIRED_POLICIES } from './policies';
import { ProbeSkipped, RazorpayProbe, StorefrontProbe, StorefrontTarget } from './qa-probes';

export type CheckStatus = 'pass' | 'fail' | 'skipped';
export interface CheckResult { id: string; label: string; status: CheckStatus; detail: string; durationMs: number }

export const LIGHTHOUSE_MIN = 85;
/** A policy page shorter than this is treated as a placeholder, not a policy. */
const MIN_POLICY_CHARS = 200;

export const QA_CHECKS = [
  { id: 'test_order', label: 'Test order placed' },
  { id: 'invoice', label: 'Invoice generated' },
  { id: 'owner_alert', label: 'Owner alert delivered' },
  { id: 'lighthouse_mobile', label: `Lighthouse mobile ${LIGHTHOUSE_MIN}+` },
  { id: 'ssl_valid', label: 'SSL certificate valid' },
  { id: 'policy_pages', label: '4 policy pages present' },
  { id: 'payment_keys', label: 'Payment keys working' },
] as const;
type CheckId = (typeof QA_CHECKS)[number]['id'];

interface Ctx { tenantId: string; target: StorefrontTarget; orderNo?: string; orderId?: string }

class Skip extends Error {}
class Fail extends Error {}

/**
 * Automated QA. Each check returns pass / fail / skipped with a plain-language detail; a crash inside a check is a
 * fail of that check, never of the run. The run PASSES when no check failed (skipped checks are listed, not hidden).
 * Every run is stored (qa_runs) and raises a qa.result event.
 */
@Injectable()
export class QaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ConsoleScope,
    private readonly storefront: StorefrontProbe,
    private readonly razorpay: RazorpayProbe,
    private readonly tlsProbe: TlsProbe,
    private readonly domains: DomainService,
    private readonly secrets: TenantSecretsService,
    private readonly notifier: Notifier,
    private readonly events: ConsoleEvents,
  ) {}
  private get db() { return this.prisma.db; }

  private readonly checks: Record<CheckId, (c: Ctx) => Promise<string>> = {
    test_order: async (c) => {
      const o = await this.storefront.placeTestOrder(c.target);
      c.orderNo = o.orderNo;
      c.orderId = o.orderId;
      return `Order ${o.orderNo} placed (₹${(o.totalPaise / 100).toLocaleString('en-IN')}); cancelled and restocked after the invoice check`;
    },
    invoice: async (c) => {
      if (!c.orderNo) throw new Fail('No test order to invoice (the test order check failed)');
      const inv = await this.storefront.fetchInvoice(c.target, c.orderNo);
      if (!inv.invoiceNo) throw new Fail('Invoice has no number');
      return `Invoice for ${inv.invoiceNo} generated (PDF, ${Math.round(inv.bytes / 1024)} KB)`;
    },
    owner_alert: async (c) => {
      const t = await this.db.tenant.findUniqueOrThrow({ where: { id: c.tenantId } });
      const owner = await this.db.user.findFirst({ where: { role: 'store_owner', isActive: true }, orderBy: { createdAt: 'asc' } });
      const to = t.whatsappNumber ?? null;
      const channel = to ? 'whatsapp' : owner?.email ? 'email' : null;
      if (!channel) throw new Fail('No owner WhatsApp number or email to alert');
      const d = await this.notifier.send({ channel, to: (to ?? owner!.email), template: 'qa_owner_alert_test', text: `Test alert from your store setup: new orders for ${t.name} will be announced like this.`, tenantId: c.tenantId });
      if (!d.delivered) throw new Fail(`Alert not delivered: ${d.detail ?? d.transport}`);
      return `Delivered by ${channel}${d.transport === 'stub' ? ' (stub transport: no WhatsApp provider wired yet)' : ''}`;
    },
    lighthouse_mobile: async (c) => {
      const { performance } = await this.storefront.lighthouseMobile(c.target);
      if (performance < LIGHTHOUSE_MIN) throw new Fail(`Mobile performance ${performance} (needs ${LIGHTHOUSE_MIN}+)`);
      return `Mobile performance ${performance}`;
    },
    ssl_valid: async (c) => {
      if (this.domains.isLocal(c.target.host)) throw new Skip('SSL check skipped locally');
      const r = await this.tlsProbe.check(c.target.host);
      if (r.status !== 'valid') throw new Fail(r.detail);
      return `${c.target.host}: ${r.detail}`;
    },
    policy_pages: async () => {
      const pages = await this.db.page.findMany({ where: { slug: { in: REQUIRED_POLICIES.map((p) => p.slug) } }, select: { slug: true, content: true } });
      const ok = new Set(pages.filter((p) => p.content.trim().length >= MIN_POLICY_CHARS).map((p) => p.slug));
      const missing = REQUIRED_POLICIES.filter((p) => !ok.has(p.slug)).map((p) => p.title);
      if (missing.length) throw new Fail(`Missing or empty: ${missing.join(', ')}`);
      return 'Privacy, Terms, Refund and Shipping pages present';
    },
    payment_keys: async (c) => {
      const intake = await this.db.storeIntake.findUnique({ where: { tenantId: c.tenantId } });
      const settings = await this.db.settings.findUnique({ where: { tenantId: c.tenantId } });
      const creds = await this.secrets.getRazorpayCredentials();
      if (!creds) {
        if (intake?.razorpayStatus === 'not_needed' && settings?.codEnabled) throw new Skip('COD-only store (no online payments)');
        throw new Fail(intake?.razorpayStatus === 'kyc_pending' ? 'Razorpay keys not set (client KYC pending)' : 'Razorpay keys not set');
      }
      if (creds.keyId.startsWith('rzp_test_')) throw new Fail('Test-mode keys: add the live keys before go-live');
      const r = await this.razorpay.verify(creds.keyId, creds.keySecret);
      if (!r.ok) throw new Fail(r.detail);
      return r.detail;
    },
  };

  /** Run every check for one store, store the run, raise the event. `actor` null = a job. */
  async run(actor: AuthActor | null, tenantId: string): Promise<QaRun> {
    const t = await this.scope.tenant(actor, tenantId);
    const host = t.customDomain ?? this.scope.storeHost(t);
    const ctx: Ctx = { tenantId, target: { tenantId, host, url: this.scope.storeUrl(t) } };
    const startedAt = new Date();
    const results: CheckResult[] = [];
    await this.scope.asTenant(tenantId, async () => {
      for (const c of QA_CHECKS) {
        const t0 = Date.now();
        let status: CheckStatus = 'pass';
        let detail: string;
        try {
          detail = await this.checks[c.id](ctx);
        } catch (e: any) {
          if (e instanceof Skip || e instanceof ProbeSkipped) { status = 'skipped'; detail = e.message; }
          else if (e instanceof Fail) { status = 'fail'; detail = e.message; }
          else { status = 'fail'; detail = `Check crashed: ${String(e?.message ?? e).slice(0, 200)}`; }
        }
        results.push({ id: c.id, label: c.label, status, detail, durationMs: Date.now() - t0 });
        // The test order never stays open: cancel + restock right after its invoice was checked.
        if (c.id === 'invoice' && ctx.orderId) {
          try { await this.storefront.cleanup(ctx.target, ctx.orderId); } catch (e: any) {
            results.push({ id: 'test_order_cleanup', label: 'Test order cancelled', status: 'fail', detail: `Cancel it by hand: ${String(e?.message ?? e).slice(0, 200)}`, durationMs: 0 });
          }
        }
      }
    }, actor ?? undefined);
    const passed = results.every((r) => r.status !== 'fail');
    const run = await this.scope.asTenant(tenantId, () =>
      this.db.qaRun.create({ data: { tenantId, passed, results: results as unknown as Prisma.InputJsonValue, triggeredBy: actor?.id ?? null, startedAt, finishedAt: new Date() } }),
    );
    await this.scope.audit(actor?.id ?? null, tenantId, 'console.qa_run', { passed, failed: results.filter((r) => r.status === 'fail').map((r) => r.id) });
    await this.events.qaResult(tenantId, run);
    return run;
  }

  latest(actor: AuthActor | null, tenantId: string) {
    return this.scope.inTenant(actor, tenantId, () => this.db.qaRun.findFirst({ orderBy: { startedAt: 'desc' } }));
  }

  history(actor: AuthActor, tenantId: string, take = 10) {
    return this.scope.inTenant(actor, tenantId, () => this.db.qaRun.findMany({ orderBy: { startedAt: 'desc' }, take }));
  }
}
