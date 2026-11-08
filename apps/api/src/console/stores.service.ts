import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { AppConfig } from '../config/app-config';
import { AuthActor, RequestContext } from '../common/request-context';
import { daysBetween } from '../common/working-days';
import { MB } from '../limits/limits';
import { Notifier } from '../notify/notifier';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SuperadminTenantsService } from '../superadmin/tenants.service';
import { ConsoleScope, safeTenant } from './console-scope';
import { ConsoleEvents } from './events';
import { missingFields } from './intake';
import { deliveryDeadline, deriveStage, PLAN_DAYS, planDay, RENEWAL_DAYS, Stage, STAGES } from './stage';

/** QA older than this must be re-run before go-live. */
export const QA_FRESH_HOURS = 24;
const IMPERSONATE_TTL_SEC = 120;
const impKey = (code: string) => `console:impersonate:${code}`;
/** Usage at or above this share of a limit is a warning. */
export const USAGE_WARN_RATIO = 0.8;

type TenantRow = Tenant & {
  intake: { completedAt: Date | null; receivedAt: Date; chasersSent: number; parkedAt: Date | null; razorpayStatus: string } | null;
  domainMapping: { domain: string; dnsStatus: string; sslStatus: string } | null;
  qaRuns: Array<{ passed: boolean; finishedAt: Date | null; startedAt: Date; results: Prisma.JsonValue }>;
  usage: { productCount: number; mediaBytes: bigint } | null;
};

export interface StoreCard {
  id: string; name: string; subdomain: string; url: string; status: string; stage: Stage; stageLabel: string;
  intake: { complete: boolean; receivedAt: string | null; completedAt: string | null; daysSinceReceived: number | null; chasersSent: number } | null;
  deliveryDeadline: string | null;
  qa: { passed: boolean; at: string; failed: string[] } | null;
  domain: { domain: string; dnsStatus: string; sslStatus: string } | null;
  wentLiveAt: string | null; expiresAt: string | null; daysToExpiry: number | null; planDay: number | null;
  usage: { products: number; maxProducts: number; mediaMb: number; maxMediaMb: number };
  createdAt: string;
}

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ConsoleScope,
    private readonly cfg: AppConfig,
    private readonly tenants: SuperadminTenantsService,
    private readonly events: ConsoleEvents,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    private readonly notifier: Notifier,
  ) {}
  private get db() { return this.prisma.db; }

  private readonly include = {
    intake: { select: { completedAt: true, receivedAt: true, chasersSent: true, parkedAt: true, razorpayStatus: true } },
    domainMapping: { select: { domain: true, dnsStatus: true, sslStatus: true } },
    qaRuns: { orderBy: { startedAt: 'desc' as const }, take: 1, select: { passed: true, finishedAt: true, startedAt: true, results: true } },
    usage: { select: { productCount: true, mediaBytes: true } },
  };

  card(t: TenantRow, now = new Date()): StoreCard {
    const qa = t.qaRuns[0] ?? null;
    const stage = deriveStage({ status: t.status, expiresAt: t.expiresAt, hasIntake: !!t.intake, intakeCompletedAt: t.intake?.completedAt, latestQa: qa }, now);
    return {
      id: t.id, name: t.name, subdomain: t.subdomain, url: this.scope.storeUrl(t), status: t.status, stage, stageLabel: STAGES.find((s) => s.id === stage)!.label,
      intake: t.intake ? {
        complete: !!t.intake.completedAt, receivedAt: t.intake.receivedAt.toISOString(), completedAt: t.intake.completedAt?.toISOString() ?? null,
        daysSinceReceived: daysBetween(t.intake.receivedAt, now), chasersSent: t.intake.chasersSent,
      } : null,
      deliveryDeadline: deliveryDeadline(t.intake?.completedAt, this.cfg.holidays)?.toISOString() ?? null,
      qa: qa ? { passed: qa.passed, at: (qa.finishedAt ?? qa.startedAt).toISOString(), failed: ((qa.results as any[]) ?? []).filter((r) => r.status === 'fail').map((r) => r.label) } : null,
      domain: t.domainMapping,
      wentLiveAt: t.wentLiveAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      daysToExpiry: t.expiresAt ? daysBetween(now, t.expiresAt) : null,
      planDay: planDay(t.wentLiveAt, now),
      usage: { products: t.usage?.productCount ?? 0, maxProducts: t.maxProducts, mediaMb: Math.round((Number(t.usage?.mediaBytes ?? 0n) / MB) * 10) / 10, maxMediaMb: t.maxMediaMb },
      createdAt: t.createdAt.toISOString(),
    };
  }

  /** Every store as a card (actor null = a job). Cross-store read through the audited bypass. */
  async cards(actor: AuthActor | null, now = new Date()): Promise<StoreCard[]> {
    const run = () => this.db.tenant.findMany({ include: this.include, orderBy: { createdAt: 'desc' } });
    const rows = (actor ? await this.scope.platform(actor, 'list-stores', run) : await this.scope.system('list-stores', run)) as unknown as TenantRow[];
    return rows.map((r) => this.card(r, now));
  }

  async list(actor: AuthActor, q: { stage?: string; q?: string }) {
    let cards = await this.cards(actor);
    const counts = Object.fromEntries(STAGES.map((s) => [s.id, cards.filter((c) => c.stage === s.id).length]));
    if (q.stage) cards = cards.filter((c) => c.stage === q.stage);
    if (q.q) { const n = q.q.toLowerCase(); cards = cards.filter((c) => c.name.toLowerCase().includes(n) || c.subdomain.includes(n) || c.domain?.domain.includes(n)); }
    return { stages: STAGES.map((s) => ({ ...s, count: counts[s.id] })), items: cards };
  }

  async detail(actor: AuthActor, id: string) {
    const row = (await this.scope.platform(actor, 'store-detail', () => this.db.tenant.findUnique({ where: { id }, include: this.include }))) as unknown as TenantRow | null;
    if (!row) throw new NotFoundException('Store not found');
    const card = this.card(row);
    const extra = await this.scope.asTenant(id, async () => {
      const intake = await this.db.storeIntake.findUnique({ where: { tenantId: id } });
      const owner = await this.db.user.findFirst({ where: { role: 'store_owner' }, orderBy: { createdAt: 'asc' }, select: { email: true, isActive: true } });
      const policies = await this.db.page.findMany({ where: { isPolicy: true }, select: { slug: true, title: true } });
      const audit = await this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15, select: { action: true, createdAt: true, actorId: true } });
      return { intake: intake ? { ...intake, missing: missingFields(intake as any) } : null, owner, policies, audit };
    }, actor);
    return {
      ...card,
      tenant: safeTenant(row),
      adminUrl: this.scope.adminUrl(row),
      previewUrl: card.url,
      canGoLive: this.goLiveBlocker(row) === null,
      goLiveBlocker: this.goLiveBlocker(row),
      ...extra,
    };
  }

  /** null = go-live allowed; else the plain reason it is not. */
  private goLiveBlocker(t: TenantRow, now = new Date()): string | null {
    if (t.status === 'LIVE') return 'Already live';
    if (t.status !== 'BUILDING') return `Store is ${t.status.toLowerCase()}`;
    const qa = t.qaRuns[0];
    if (!qa) return 'Run QA first';
    if (!qa.passed) return 'Latest QA failed';
    if (now.getTime() - (qa.finishedAt ?? qa.startedAt).getTime() > QA_FRESH_HOURS * 3_600_000) return `QA is older than ${QA_FRESH_HOURS} hours; run it again`;
    return null;
  }

  /** Go live: only when the latest QA passed (and is fresh). Starts the 365-day plan unless an expiry is already set. */
  async goLive(actor: AuthActor, id: string) {
    const row = (await this.scope.platform(actor, 'go-live-check', () => this.db.tenant.findUnique({ where: { id }, include: this.include }))) as unknown as TenantRow | null;
    if (!row) throw new NotFoundException('Store not found');
    const blocker = this.goLiveBlocker(row);
    if (blocker) throw new ConflictException(blocker);
    const now = new Date();
    const expiresAt = row.expiresAt && row.expiresAt > now ? row.expiresAt : new Date(now.getTime() + PLAN_DAYS * 86_400_000);
    await this.scope.platform(actor, 'go-live', () => this.db.tenant.update({ where: { id }, data: { wentLiveAt: row.wentLiveAt ?? now, expiresAt } }));
    await this.tenants.setStatus(actor, id, 'LIVE', 'go-live after QA passed'); // cache invalidation + audit row
    await this.tenants.record(actor, 'tenant.went_live', id, { expiresAt: expiresAt.toISOString() });
    if (row.whatsappNumber) {
      await this.notifier.send({ channel: 'whatsapp', to: row.whatsappNumber, template: 'store_live', text: `${row.name} is live: ${this.scope.storeUrl(row)}`, tenantId: id });
    }
    await this.events.wentLive(id);
    return this.detail(actor, id);
  }

  async suspend(actor: AuthActor, id: string, reason?: string) {
    await this.scope.tenant(actor, id);
    await this.tenants.setStatus(actor, id, 'SUSPENDED', reason ?? 'suspended from console');
    return this.detail(actor, id);
  }

  /** Back to LIVE if the store ever went live, otherwise back to BUILDING (never skips QA). */
  async unsuspend(actor: AuthActor, id: string, reason?: string) {
    const t = await this.scope.tenant(actor, id);
    if (t.status === 'LIVE' || t.status === 'BUILDING') throw new ConflictException(`Store is already ${t.status.toLowerCase()}`);
    await this.tenants.setStatus(actor, id, t.wentLiveAt ? 'LIVE' : 'BUILDING', reason ?? 'unsuspended from console');
    if (t.status === 'PARKED') await this.scope.asTenant(id, () => this.db.storeIntake.updateMany({ data: { parkedAt: null, receivedAt: new Date(), chasersSent: 0 } }));
    return this.detail(actor, id);
  }

  /** Extend from the later of today and the current expiry. A store suspended for expiry comes back live. */
  async extend(actor: AuthActor, id: string, days: number, reason?: string) {
    if (!Number.isInteger(days) || days < 1 || days > 1100) throw new BadRequestException('Days must be 1 to 1100');
    const t = await this.scope.tenant(actor, id);
    const now = new Date();
    const from = t.expiresAt && t.expiresAt > now ? t.expiresAt : now;
    const next = new Date(from.getTime() + days * 86_400_000);
    await this.tenants.setExpiry(actor, id, next.toISOString(), reason ?? `extended ${days} days`);
    if (t.status === 'SUSPENDED' && t.wentLiveAt && t.expiresAt && t.expiresAt <= now) await this.tenants.setStatus(actor, id, 'LIVE', 'renewed');
    return this.detail(actor, id);
  }

  // ---- impersonation ---------------------------------------------------------------------------------------
  /**
   * Developer opens the store admin AS the owner. Audited with a reason. Issues a one-time code (2 minutes) that the
   * store admin's /api/auth/impersonate route redeems on the store's own host for a 15-minute owner session with no
   * refresh token. Cookies are set by the admin on the store host only (host-only, never Domain=.bmtechx.in).
   */
  async impersonate(actor: AuthActor, id: string, reason: string) {
    if (!reason || reason.trim().length < 5) throw new BadRequestException('Say why (at least 5 characters): it goes in the audit log');
    const t = await this.scope.tenant(actor, id);
    const owner = await this.scope.asTenant(id, () => this.db.user.findFirst({ where: { role: 'store_owner', isActive: true }, orderBy: { createdAt: 'asc' } }));
    if (!owner) throw new BadRequestException('This store has no active owner login yet');
    const code = randomBytes(24).toString('base64url');
    await this.redis.client.set(impKey(code), JSON.stringify({ tenantId: id, userId: owner.id, by: actor.id }), 'EX', IMPERSONATE_TTL_SEC);
    await this.tenants.record(actor, 'tenant.impersonation_started', id, { reason: reason.trim().slice(0, 500), ownerId: owner.id });
    await this.scope.audit(actor.id, id, 'console.impersonation_started', { reason: reason.trim().slice(0, 500) });
    return { url: `${this.scope.adminUrl(t)}/api/auth/impersonate?code=${encodeURIComponent(code)}`, expiresInSeconds: IMPERSONATE_TTL_SEC };
  }

  /** Called on the STORE host by the admin app. Single use (GETDEL); the code must belong to this host's store. */
  async redeemImpersonation(code: string) {
    const tenantId = RequestContext.tenantId();
    if (!tenantId) throw new ForbiddenException('Open this link on the store address');
    let raw: string | null = null;
    try { raw = await this.redis.client.getdel(impKey(code)); } catch { raw = null; }
    if (!raw) throw new ForbiddenException('This link has expired or was already used');
    const v = JSON.parse(raw) as { tenantId: string; userId: string; by: string };
    if (v.tenantId !== tenantId) throw new ForbiddenException('This link is for another store');
    const tokens = await this.auth.issueImpersonation(v.userId, tenantId, v.by);
    await this.scope.audit(v.by, tenantId, 'console.impersonation_redeemed', { ownerId: v.userId });
    return tokens;
  }

  // ---- renewals, usage, needs attention -------------------------------------------------------------------
  /** Live stores from plan day 305 on (and anything expired), with which reminders are due. */
  async renewals(actor: AuthActor | null, now = new Date()) {
    const cards = (await this.cards(actor, now)).filter((c) => c.wentLiveAt && ((c.planDay ?? 0) >= RENEWAL_DAYS[0] || (c.daysToExpiry ?? 999) <= PLAN_DAYS - RENEWAL_DAYS[0]));
    return cards.map((c) => ({
      ...c,
      milestones: RENEWAL_DAYS.map((d) => ({ day: d, reached: (c.planDay ?? 0) >= d })),
      expired: (c.daysToExpiry ?? 0) < 0,
    })).sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));
  }

  async usage(actor: AuthActor | null) {
    const cards = await this.cards(actor);
    return cards.map((c) => ({
      id: c.id, name: c.name, subdomain: c.subdomain, stage: c.stage, stageLabel: c.stageLabel, ...c.usage,
      productRatio: c.usage.maxProducts ? c.usage.products / c.usage.maxProducts : 0,
      mediaRatio: c.usage.maxMediaMb ? c.usage.mediaMb / c.usage.maxMediaMb : 0,
    })).map((u) => ({ ...u, warning: u.productRatio >= USAGE_WARN_RATIO || u.mediaRatio >= USAGE_WARN_RATIO }))
      .sort((a, b) => Math.max(b.productRatio, b.mediaRatio) - Math.max(a.productRatio, a.mediaRatio));
  }

  /**
   * Home screen: what needs the developer today. Stuck intakes (incomplete 2+ days), delivery deadline close or
   * missed (refund risk), failed QA, stores ready for go-live, expiring/expired stores, usage near the fair-use limit.
   */
  async attention(actor: AuthActor | null, now = new Date()) {
    const cards = await this.cards(actor, now);
    const items: Array<{ kind: string; severity: 'high' | 'medium' | 'low'; store: { id: string; name: string; stage: Stage; stageLabel: string }; title: string; detail: string }> = [];
    const push = (c: StoreCard, kind: string, severity: 'high' | 'medium' | 'low', title: string, detail: string) =>
      items.push({ kind, severity, store: { id: c.id, name: c.name, stage: c.stage, stageLabel: c.stageLabel }, title, detail });
    for (const c of cards) {
      if (c.stage === 'intake' && c.intake && (c.intake.daysSinceReceived ?? 0) >= 2) {
        push(c, 'stuck_intake', (c.intake.daysSinceReceived ?? 0) >= 7 ? 'high' : 'medium', 'Intake incomplete', `Received ${c.intake.daysSinceReceived} days ago, ${c.intake.chasersSent} chaser${c.intake.chasersSent === 1 ? '' : 's'} sent. Parks automatically on day 14.`);
      }
      if (c.status === 'BUILDING' && c.deliveryDeadline) {
        const hoursLeft = (new Date(c.deliveryDeadline).getTime() - now.getTime()) / 3_600_000;
        if (hoursLeft < 0) push(c, 'deadline_missed', 'high', 'Delivery deadline missed', `Was due ${new Date(c.deliveryDeadline).toDateString()}. The client may claim a full refund.`);
        else if (hoursLeft < 72) push(c, 'deadline_close', 'high', 'Delivery deadline close', `Due ${new Date(c.deliveryDeadline).toDateString()} (${Math.max(1, Math.round(hoursLeft))} hours left).`);
      }
      if (c.stage === 'qa' && c.qa) push(c, 'qa_failed', 'medium', 'QA failed', c.qa.failed.join(', ') || 'See QA results');
      if (c.stage === 'review') push(c, 'ready_to_go_live', 'low', 'QA passed: ready to go live', 'Review the mobile preview, then press Go live.');
      if (c.status === 'LIVE' && c.daysToExpiry !== null && c.daysToExpiry <= 30) {
        push(c, c.daysToExpiry < 0 ? 'expired' : 'expiring', c.daysToExpiry <= 7 ? 'high' : 'medium', c.daysToExpiry < 0 ? 'Plan expired' : 'Plan expiring', c.daysToExpiry < 0 ? `Expired ${-c.daysToExpiry} days ago.` : `${c.daysToExpiry} days left (plan day ${c.planDay}).`);
      }
      const ratio = Math.max(c.usage.products / (c.usage.maxProducts || 1), c.usage.mediaMb / (c.usage.maxMediaMb || 1));
      if (ratio >= USAGE_WARN_RATIO) push(c, 'usage', ratio >= 0.95 ? 'high' : 'low', 'Near the fair-use limit', `${c.usage.products.toLocaleString('en-IN')} of ${c.usage.maxProducts.toLocaleString('en-IN')} products, ${c.usage.mediaMb.toLocaleString('en-IN')} MB of ${c.usage.maxMediaMb.toLocaleString('en-IN')} MB images.`);
    }
    const rank = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => rank[a.severity] - rank[b.severity]);
    const counts = Object.fromEntries(STAGES.map((s) => [s.id, cards.filter((c) => c.stage === s.id).length]));
    return { items, counts, total: cards.length };
  }
}
