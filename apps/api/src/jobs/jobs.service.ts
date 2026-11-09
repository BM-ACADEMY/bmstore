import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { NotificationsService } from '../notifications/notifications.service';
import { parseItems } from '../orders/order-items';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CheckoutService } from '../storefront/checkout.service';

/**
 * Background work inside the API process (JOBS_ENABLED=1, every JOBS_INTERVAL_MS):
 *   - expireUnpaidOrders: ONLINE orders still unpaid after settings.unpaid_order_ttl_min are cancelled and restocked
 *     (a payment that lands afterwards reopens the order: see PaymentsService.markPaid),
 *   - weeklySummary: Monday 09:00 IST, one owner summary per store, guarded by a Redis key so several API replicas
 *     send it once.
 * The tenant list is the only cross-tenant read (prisma.base, allow-listed in the gate); all work runs in runAsTenant.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(JobsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly cfg: AppConfig, private readonly redis: RedisService, private readonly checkout: CheckoutService, private readonly notifications: NotificationsService) {}

  onModuleInit() {
    if (!this.cfg.jobsEnabled) return;
    this.timer = setInterval(() => void this.tick(), this.cfg.jobsIntervalMs);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      await this.expireUnpaidOrders(now);
      if (this.isWeeklySlot(now)) await this.weeklySummaries(now);
    } catch (e) {
      this.log.warn(`job tick failed: ${(e as Error).name}`);
    } finally { this.running = false; }
  }

  private async tenantIds(): Promise<Array<{ id: string; name: string; slug: string }>> {
    return this.prisma.base.tenant.findMany({ where: { status: { in: ['LIVE', 'BUILDING'] } }, select: { id: true, name: true, slug: true } });
  }

  /** Returns the number of orders cancelled. */
  async expireUnpaidOrders(now = new Date()): Promise<number> {
    let n = 0;
    for (const t of await this.tenantIds()) {
      n += await this.prisma.runAsTenant(t.id, async () => {
        const due = await this.prisma.db.order.findMany({ where: { paymentMode: 'ONLINE', paymentStatus: { in: ['PENDING', 'FAILED'] }, orderStatus: 'PENDING', expiresAt: { lte: now } }, select: { id: true, orderNo: true }, take: 200 });
        let c = 0;
        for (const o of due) if (await this.checkout.cancelAndRestock(o.id, 'payment not completed in time')) c++;
        if (c) this.log.log(`${t.slug}: ${c} unpaid order(s) expired and restocked`);
        return c;
      });
    }
    return n;
  }

  /** Monday between 09:00 and 09:59 IST. */
  isWeeklySlot(now: Date): boolean {
    const ist = new Date(now.getTime() + 330 * 60_000);
    return ist.getUTCDay() === 1 && ist.getUTCHours() === 9;
  }
  private weekKey(now: Date) {
    const ist = new Date(now.getTime() + 330 * 60_000);
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
  }

  /** Sends every store its summary for the last 7 days (once per store per week across replicas). Returns stores notified. */
  async weeklySummaries(now = new Date(), force = false): Promise<number> {
    let sent = 0;
    for (const t of await this.tenantIds()) {
      if (!force) {
        try {
          const ok = await this.redis.client.set(`jobs:weekly:${this.weekKey(now)}:${t.id}`, '1', 'EX', 7 * 86_400, 'NX');
          if (ok !== 'OK') continue;
        } catch { /* no Redis: still send (at most one replica is expected without it) */ }
      }
      await this.prisma.runAsTenant(t.id, async () => { await this.notifications.weeklySummary(await this.summarize(now), t.name); });
      sent++;
    }
    return sent;
  }

  /** Numbers for the trailing 7 days, computed inside the tenant scope. */
  async summarize(now = new Date()) {
    const db = this.prisma.db;
    const to = now, from = new Date(now.getTime() - 7 * 86_400_000);
    const orders = await db.order.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { items: true, total: true, orderStatus: true, paymentMode: true, paymentStatus: true } });
    const live = orders.filter((o) => o.orderStatus !== 'CANCELLED');
    const sold = new Map<string, number>();
    for (const o of live) for (const it of parseItems(o.items)) sold.set(it.name, (sold.get(it.name) ?? 0) + it.qty);
    const settings = await db.settings.findFirst();
    return {
      from, to, orders: live.length, sales: live.reduce((n, o) => n + o.total, 0),
      cancelled: orders.length - live.length,
      codPending: await db.order.count({ where: { paymentMode: 'COD', paymentStatus: 'PENDING', orderStatus: { notIn: ['CANCELLED', 'RETURNED'] } } }),
      top: [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty })),
      lowStock: await db.product.count({ where: { status: 'ACTIVE', stock: { lte: settings?.lowStockThreshold ?? 5 } } }),
    };
  }
}
