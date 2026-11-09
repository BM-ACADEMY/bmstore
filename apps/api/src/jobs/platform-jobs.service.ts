import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { AppConfig } from '../config/app-config';
import { daysBetween, istDay } from '../common/working-days';
import { Notifier } from '../notify/notifier';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TenantResolver } from '../tenancy/tenant-resolver.service';
import { ConsoleScope } from '../console/console-scope';
import { ConsoleEvents } from '../console/events';
import { OutboxService } from '../console/outbox';
import { RENEWAL_DAYS, STAGES } from '../console/stage';
import { StoresService, USAGE_WARN_RATIO } from '../console/stores.service';

/** Intake chasers on these days after the intake was received; parked on PARK_DAY if still incomplete. */
export const CHASER_DAYS = [2, 4, 7] as const;
export const PARK_DAY = 14;
/** A nightly backup older than this counts as missed. */
export const BACKUP_MAX_AGE_HOURS = 26;

export const JOB_NAMES = ['intake-chasers', 'renewal-reminders', 'expiry-suspend', 'backup-check', 'usage-warnings', 'weekly-summary'] as const;
export type JobName = (typeof JOB_NAMES)[number];

export interface JobResult { job: JobName; at: string; summary: string; details: Record<string, unknown> }
export const lastRunKey = (job: string) => `jobs:last:${job}`;

/**
 * The scheduled jobs. Every method takes `now` so tests can move the clock, is safe to run twice (outbox dedupe
 * keys, state checks), and goes through the audited system bypass for cross-store reads and the tenant scope for
 * per-store writes. Notifications use the Notifier interface (stub transport until a provider is wired).
 */
@Injectable()
export class PlatformJobsService {
  private readonly log = new Logger('PlatformJobs');
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ConsoleScope,
    private readonly outbox: OutboxService,
    private readonly notifier: Notifier,
    private readonly stores: StoresService,
    private readonly resolver: TenantResolver,
    private readonly redis: RedisService,
    private readonly events: ConsoleEvents,
    private readonly cfg: AppConfig,
  ) {}
  private get db() { return this.prisma.db; }

  async run(job: JobName, now = new Date()): Promise<JobResult> {
    const fn: Record<JobName, (n: Date) => Promise<Omit<JobResult, 'job' | 'at'>>> = {
      'intake-chasers': (n) => this.intakeChasers(n),
      'renewal-reminders': (n) => this.renewalReminders(n),
      'expiry-suspend': (n) => this.expirySuspend(n),
      'backup-check': (n) => this.backupCheck(n),
      'usage-warnings': (n) => this.usageWarnings(n),
      'weekly-summary': (n) => this.weeklySummary(n),
    };
    const r = { job, at: now.toISOString(), ...(await fn[job](now)) };
    await this.redis.setex(lastRunKey(job), 14 * 86_400, JSON.stringify(r));
    this.log.log(`${job}: ${r.summary}`);
    return r;
  }

  async lastRuns(): Promise<Array<JobResult | { job: JobName; at: null }>> {
    const out = [];
    for (const job of JOB_NAMES) {
      const raw = await this.redis.get(lastRunKey(job));
      out.push(raw ? (JSON.parse(raw) as JobResult) : { job, at: null });
    }
    return out;
  }

  private ownerContact(t: { whatsappNumber: string | null }, intake?: { whatsapp: string | null; email: string | null } | null) {
    const wa = t.whatsappNumber ?? intake?.whatsapp ?? null;
    if (wa) return { channel: 'whatsapp' as const, to: wa };
    if (intake?.email) return { channel: 'email' as const, to: intake.email };
    return null;
  }

  private async setStatus(tenantId: string, status: 'PARKED' | 'SUSPENDED', reason: string) {
    const r = await this.scope.system(`set-status:${reason}`, async () => {
      const before = await this.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const after = await this.db.tenant.update({ where: { id: tenantId }, data: { status } });
      return { before, after };
    });
    await this.resolver.invalidate(r.before, r.after);
    await this.scope.audit(null, tenantId, `jobs.tenant_${status.toLowerCase()}`, { reason });
  }

  // ---- intake chasers (day 2, 4, 7; park at 14) ------------------------------------------------------------
  async intakeChasers(now: Date) {
    const intakes = await this.scope.system('intake-chasers', () =>
      this.db.storeIntake.findMany({ where: { completedAt: null, parkedAt: null, tenant: { status: 'BUILDING' } }, include: { tenant: { select: { id: true, name: true, whatsappNumber: true } } } }),
    );
    let chased = 0, parked = 0;
    for (const i of intakes) {
      const day = daysBetween(i.receivedAt, now);
      const contact = this.ownerContact(i.tenant, i);
      if (day >= PARK_DAY) {
        await this.scope.asTenant(i.tenantId, () => this.db.storeIntake.update({ where: { tenantId: i.tenantId }, data: { parkedAt: now } }));
        await this.setStatus(i.tenantId, 'PARKED', `intake incomplete for ${day} days`);
        if (contact) await this.outbox.notice(i.tenantId, { event: 'intake.parked', dedupeKey: `intake-parked-${istDay(i.receivedAt)}`, ...contact, template: 'intake_parked', text: `We have paused setting up ${i.tenant.name} because some details are still missing. Reply any time to restart.` });
        await this.notifier.send({ channel: 'whatsapp', to: this.cfg.developerWhatsapp, template: 'dev_intake_parked', text: `Parked: ${i.tenant.name} (intake incomplete ${day} days)` });
        parked++;
        continue;
      }
      const due = CHASER_DAYS.filter((d) => day >= d).length; // how many chasers should have gone by now
      if (due > i.chasersSent && contact) {
        const sent = await this.outbox.notice(i.tenantId, {
          event: 'intake.chaser', dedupeKey: `intake-chaser-${due}-${istDay(i.receivedAt)}`, ...contact, template: `intake_chaser_${due}`,
          text: `Hi ${i.ownerName ?? ''}, to finish ${i.tenant.name} we still need a few details. Reply here and we will take it from there.`.replace('Hi ,', 'Hi,'),
          payload: { day, chaser: due },
        });
        await this.scope.asTenant(i.tenantId, () => this.db.storeIntake.update({ where: { tenantId: i.tenantId }, data: { chasersSent: due, lastChasedAt: now } }));
        if (sent) chased++;
      }
    }
    return { summary: `${chased} chased, ${parked} parked (of ${intakes.length} incomplete)`, details: { chased, parked, open: intakes.length } };
  }

  // ---- renewal reminders (plan day 305 and 335) -------------------------------------------------------------
  async renewalReminders(now: Date) {
    const rows = await this.scope.system('renewal-reminders', () =>
      this.db.tenant.findMany({ where: { status: 'LIVE', wentLiveAt: { not: null }, expiresAt: { not: null } }, select: { id: true, name: true, whatsappNumber: true, wentLiveAt: true, expiresAt: true, intake: { select: { whatsapp: true, email: true } } } }),
    );
    let sent = 0;
    for (const t of rows) {
      const day = daysBetween(t.wentLiveAt!, now);
      const milestone = [...RENEWAL_DAYS].reverse().find((d) => day >= d);
      if (!milestone) continue;
      const contact = this.ownerContact(t, t.intake);
      const key = `renewal-${milestone}-${istDay(t.expiresAt!)}`; // per plan period: a renewed store gets reminders again next year
      const daysLeft = daysBetween(now, t.expiresAt!);
      const did = contact ? await this.outbox.notice(t.id, {
        event: 'renewal.reminder', dedupeKey: key, ...contact, template: `renewal_day_${milestone}`,
        text: `${t.name}: your store plan renews on ${t.expiresAt!.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} (${daysLeft} days). Reply to renew and keep the store open.`,
        payload: { milestone, daysLeft },
      }) : false;
      if (did) { sent++; await this.events.renewalDue(t.id, milestone, t.expiresAt!); }
    }
    return { summary: `${sent} renewal reminders sent`, details: { sent, live: rows.length } };
  }

  // ---- expiry -> suspend (the storefront shows the expired notice) -----------------------------------------
  async expirySuspend(now: Date) {
    const expired = await this.scope.system('expiry-suspend', () =>
      this.db.tenant.findMany({ where: { status: 'LIVE', expiresAt: { lte: now } }, select: { id: true, name: true, whatsappNumber: true, expiresAt: true, intake: { select: { whatsapp: true, email: true } } } }),
    );
    for (const t of expired) {
      await this.setStatus(t.id, 'SUSPENDED', 'plan expired');
      const contact = this.ownerContact(t, t.intake);
      if (contact) await this.outbox.notice(t.id, { event: 'store.expired', dedupeKey: `expired-${istDay(t.expiresAt!)}`, ...contact, template: 'store_expired', text: `${t.name} is paused because the plan has ended. Visitors see a "back soon" notice. Reply to renew and we will switch it back on.` });
    }
    if (expired.length) await this.notifier.send({ channel: 'whatsapp', to: this.cfg.developerWhatsapp, template: 'dev_expired', text: `Suspended (expired): ${expired.map((t) => t.name).join(', ')}` });
    return { summary: `${expired.length} expired store(s) suspended`, details: { suspended: expired.map((t) => t.id) } };
  }

  // ---- nightly backup status (infra/backup writes <state>/backup.nightly.last) -----------------------------
  async backupCheck(now: Date) {
    const file = join(this.cfg.backupStateDir, 'backup.nightly.last');
    let line: string | null = null;
    try { line = (await fs.readFile(file, 'utf8')).trim(); } catch { line = null; }
    let status: 'ok' | 'failed' | 'stale' | 'missing';
    let detail: string;
    if (!line) { status = 'missing'; detail = `No backup status found at ${file}`; }
    else {
      const [word, ts] = line.split(/\s+/);
      const at = ts ? new Date(ts) : null;
      const ageH = at && !Number.isNaN(at.getTime()) ? (now.getTime() - at.getTime()) / 3_600_000 : Infinity;
      if (word !== 'OK') { status = 'failed'; detail = `Last nightly backup failed (${ts ?? 'unknown time'})`; }
      else if (ageH > BACKUP_MAX_AGE_HOURS) { status = 'stale'; detail = `Last good backup is ${Math.round(ageH)} hours old`; }
      else { status = 'ok'; detail = `Last good backup ${Math.round(ageH)} hours ago`; }
    }
    if (status !== 'ok') await this.notifier.send({ channel: 'whatsapp', to: this.cfg.developerWhatsapp, template: 'dev_backup_problem', text: `Backup check: ${detail}` });
    return { summary: `${status}: ${detail}`, details: { status, detail } };
  }

  // ---- usage warnings (80% / 95% of the fair-use limits, once per month per level) --------------------------
  async usageWarnings(now: Date) {
    const usage = await this.stores.usage(null);
    const month = istDay(now).slice(0, 7);
    let warned = 0;
    for (const u of usage) {
      const ratio = Math.max(u.productRatio, u.mediaRatio);
      if (ratio < USAGE_WARN_RATIO) continue;
      const level = ratio >= 0.95 ? 95 : 80;
      const t = await this.scope.system('usage-contact', () => this.db.tenant.findUniqueOrThrow({ where: { id: u.id }, select: { whatsappNumber: true, intake: { select: { whatsapp: true, email: true } } } }));
      const contact = this.ownerContact(t, t.intake);
      const text = `${u.name} is at ${Math.round(ratio * 100)}% of its fair-use limit (${u.products.toLocaleString('en-IN')} of ${u.maxProducts.toLocaleString('en-IN')} products, ${u.mediaMb.toLocaleString('en-IN')} of ${u.maxMediaMb.toLocaleString('en-IN')} MB images).`;
      const did = await this.outbox.notice(u.id, { event: 'usage.warning', dedupeKey: `usage-${level}-${month}`, ...(contact ?? { channel: 'whatsapp' as const, to: this.cfg.developerWhatsapp }), template: `usage_warning_${level}`, text, payload: { level } });
      if (did) { warned++; await this.notifier.send({ channel: 'whatsapp', to: this.cfg.developerWhatsapp, template: 'dev_usage_warning', text }); }
    }
    return { summary: `${warned} usage warning(s)`, details: { warned } };
  }

  // ---- weekly summary to the developer -----------------------------------------------------------------------
  async weeklySummary(now: Date) {
    const cards = await this.stores.cards(null, now);
    const weekAgo = now.getTime() - 7 * 86_400_000;
    const counts = Object.fromEntries(STAGES.map((s) => [s.label, cards.filter((c) => c.stage === s.id).length]));
    const wentLive = cards.filter((c) => c.wentLiveAt && new Date(c.wentLiveAt).getTime() >= weekAgo).map((c) => c.name);
    const openRefunds = await this.scope.system('weekly-refunds', () => this.db.refundCase.count({ where: { status: { in: ['open', 'failed'] } } }));
    const att = await this.stores.attention(null, now);
    const text = [
      `BMStore week to ${istDay(now)}`,
      Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · '),
      `Went live this week: ${wentLive.length ? wentLive.join(', ') : 'none'}`,
      `Needs attention: ${att.items.filter((i) => i.severity === 'high').length} urgent, ${att.items.length} total`,
      `Open refund cases: ${openRefunds}`,
    ].join('\n');
    await this.notifier.send({ channel: this.cfg.developerEmail ? 'email' : 'whatsapp', to: this.cfg.developerEmail ?? this.cfg.developerWhatsapp, template: 'dev_weekly_summary', text });
    return { summary: `sent (${cards.length} stores)`, details: { counts, wentLive, openRefunds } };
  }
}
