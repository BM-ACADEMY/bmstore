import { Injectable, Logger } from '@nestjs/common';
import type { Order } from '@prisma/client';
import { RequestContext, TenantInfo } from '../common/request-context';
import { parseItems } from '../orders/order-items';
import { PrismaService } from '../prisma/prisma.service';
import { EmailSender, WhatsAppSender } from './senders';

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const PAY = { COD: 'Cash on delivery', ONLINE: 'Paid online' } as const;

/**
 * Who hears about what. Every method is best-effort: a failing channel is logged and never breaks checkout.
 * Runs inside the tenant request / runAsTenant scope (reads the owner and tenant from the context and database).
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  constructor(private readonly prisma: PrismaService, private readonly wa: WhatsAppSender, private readonly email: EmailSender) {}

  private tenant(): TenantInfo | undefined { return RequestContext.get()?.tenant; }
  /** Store contact numbers: from the request context, or from the row when running in a job (runAsTenant has no TenantInfo). */
  private async storeRow(): Promise<{ name: string; whatsappNumber: string | null; supportPhone: string | null } | undefined> {
    const t = this.tenant();
    if (t) return t;
    const id = RequestContext.tenantId();
    return id ? (await this.prisma.db.tenant.findUnique({ where: { id }, select: { name: true, whatsappNumber: true, supportPhone: true } })) ?? undefined : undefined;
  }
  private async ownerContacts(): Promise<{ phone: string | null; emails: string[] }> {
    const t = await this.storeRow();
    const owners = await this.prisma.db.user.findMany({ where: { role: 'store_owner', isActive: true }, select: { email: true, phone: true } });
    return { phone: t?.whatsappNumber ?? t?.supportPhone ?? owners.find((o) => o.phone)?.phone ?? null, emails: owners.map((o) => o.email) };
  }
  private async safely(what: string, fn: () => Promise<void>) {
    try { await fn(); } catch (e) { this.log.warn(`${what} failed: ${(e as Error).name}`); }
  }

  /** Instant owner alert + customer confirmation. COD: at placement. ONLINE: when the payment is confirmed. */
  async orderPlaced(order: Order, customer: { name: string; phone: string; email: string | null }, opts: { storeUrl: string; trackUrl: string; invoiceUrl: string }) {
    const t = this.tenant();
    const items = parseItems(order.items);
    const lines = items.map((i) => `• ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} × ${i.qty} = ${rupees(i.total)}`).join('\n');
    const addr = order.address as any;
    await this.safely('owner alert', async () => {
      const { phone, emails } = await this.ownerContacts();
      const text = `New order ${order.orderNo} · ${rupees(order.total)} · ${PAY[order.paymentMode]}${order.paymentMode === 'COD' ? ' (collect on delivery)' : ' · PAID'}\n${customer.name}, ${customer.phone}\n${[addr?.line1, addr?.line2, addr?.city, addr?.state, addr?.pincode].filter(Boolean).join(', ')}\n${lines}${order.customerNote ? `\nNote: ${order.customerNote}` : ''}`;
      if (phone) await this.wa.send({ to: phone, kind: 'owner.new_order', text });
      for (const to of emails) await this.email.send({ to, kind: 'owner.new_order', subject: `New order ${order.orderNo} · ${rupees(order.total)}`, text });
    });
    await this.safely('customer confirmation', async () => {
      const text = `Thank you for your order at ${t?.name ?? 'our store'}!\nOrder ${order.orderNo} · ${rupees(order.total)} · ${order.paymentMode === 'COD' ? `pay ${rupees(order.total)} in cash on delivery` : 'paid online'}\n${lines}\nTrack it: ${opts.trackUrl}\nInvoice: ${opts.invoiceUrl}`;
      await this.wa.send({ to: customer.phone, kind: 'customer.order_confirmation', text });
      if (customer.email) await this.email.send({ to: customer.email, kind: 'customer.order_confirmation', subject: `Your order ${order.orderNo} at ${t?.name ?? 'our store'}`, text });
    });
  }

  /** One message listing the products that just crossed the store's low-stock threshold. */
  async lowStock(products: Array<{ name: string; stock: number; variantLabel?: string | null }>) {
    if (!products.length) return;
    await this.safely('low-stock alert', async () => {
      const { phone, emails } = await this.ownerContacts();
      const text = `Low stock at ${this.tenant()?.name ?? 'your store'}:\n${products.map((p) => `• ${p.name}${p.variantLabel ? ` (${p.variantLabel})` : ''}: ${p.stock} left`).join('\n')}`;
      if (phone) await this.wa.send({ to: phone, kind: 'owner.low_stock', text });
      for (const to of emails) await this.email.send({ to, kind: 'owner.low_stock', subject: 'Low stock alert', text });
    });
  }

  /** Weekly owner summary (called by the jobs service for each tenant, inside runAsTenant). */
  async weeklySummary(summary: { from: Date; to: Date; orders: number; sales: number; codPending: number; cancelled: number; top: Array<{ name: string; qty: number }>; lowStock: number }, storeName: string) {
    await this.safely('weekly summary', async () => {
      const { phone, emails } = await this.ownerContacts();
      const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const text = `${storeName}: week ${fmt(summary.from)} – ${fmt(summary.to)}\nOrders: ${summary.orders} · Sales: ${rupees(summary.sales)}\nCancelled: ${summary.cancelled} · COD still to collect: ${summary.codPending}\nTop products:\n${summary.top.length ? summary.top.map((t, i) => `${i + 1}. ${t.name} × ${t.qty}`).join('\n') : '—'}\nProducts low on stock: ${summary.lowStock}`;
      if (phone) await this.wa.send({ to: phone, kind: 'owner.weekly_summary', text });
      for (const to of emails) await this.email.send({ to, kind: 'owner.weekly_summary', subject: `Your week at ${storeName}`, text });
    });
  }
}
