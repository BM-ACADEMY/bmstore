import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContext, TenantInfo } from '../common/request-context';
import { AppConfig } from '../config/app-config';
import { TenantSecretsService } from '../crypto/tenant-secrets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from './checkout.service';
import { VerifyPaymentDto } from './checkout.dto';
import { orderToken } from './order-token';
import { RazorpayService } from './razorpay.service';

/**
 * Payment state is decided here and only here, from two trustworthy inputs:
 *   1. the checkout callback signature (HMAC with the tenant's key secret) PLUS a server-side fetch of the payment,
 *   2. webhooks signed with the tenant's webhook secret, de-duplicated by event id.
 * Either path may arrive first or twice; marking an order paid is idempotent.
 */
@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);
  constructor(private readonly prisma: PrismaService, private readonly cfg: AppConfig, private readonly secrets: TenantSecretsService, private readonly checkout: CheckoutService, private readonly notifications: NotificationsService, private readonly razorpay: RazorpayService) {}
  private get db() { return this.prisma.db; }
  private tenant(): TenantInfo { const t = RequestContext.get()?.tenant; if (!t) throw new NotFoundException('Store not found'); return t; }

  /** Browser callback after Checkout.js. The signature proves Razorpay produced the ids; the fetch proves amount and status. */
  async verify(dto: VerifyPaymentDto, host: string) {
    const t = this.tenant();
    const creds = await this.secrets.getRazorpayCredentials();
    if (!creds) throw new BadRequestException('Online payment is not configured');
    if (!RazorpayService.verifyPaymentSignature(creds.keySecret, dto.razorpay_order_id, dto.razorpay_payment_id, dto.razorpay_signature)) {
      await this.db.auditLog.create({ data: { action: 'payment.bad_signature', meta: { orderNo: dto.orderNo.toUpperCase(), providerOrderId: dto.razorpay_order_id } } });
      throw new BadRequestException('Payment could not be verified');
    }
    const payment = await this.db.payment.findFirst({ where: { providerOrderId: dto.razorpay_order_id }, include: { order: true } });
    if (!payment || payment.order.orderNo !== dto.orderNo.trim().toUpperCase()) throw new BadRequestException('Payment does not belong to this order');
    const remote = await this.razorpay.fetchPayment(creds, dto.razorpay_payment_id);
    if (remote.order_id !== payment.providerOrderId || remote.amount !== payment.amount || remote.currency !== payment.currency) throw new BadRequestException('Payment details do not match the order');
    if (remote.status !== 'captured' && remote.status !== 'authorized') throw new BadRequestException(`Payment is ${remote.status}`);
    await this.markPaid(payment.id, { providerPaymentId: remote.id, method: remote.method ?? null, via: 'signature' }, host);
    return { ok: true, orderNo: payment.order.orderNo, paymentStatus: 'PAID' };
  }

  /**
   * Webhook from the tenant's Razorpay account. Raw body is verified against the tenant's webhook secret; the event id
   * is recorded in webhook_events (unique per tenant) BEFORE processing, so a redelivery is answered 200 and ignored.
   */
  async webhook(rawBody: Buffer, signature: string | undefined, eventId: string | undefined): Promise<{ ok: true; duplicate?: boolean; ignored?: string }> {
    const t = this.tenant();
    const secret = await this.secrets.getRazorpayWebhookSecret();
    if (!secret) throw new BadRequestException('Webhook secret is not configured for this store');
    if (!signature || !RazorpayService.verifyWebhookSignature(secret, rawBody, signature)) {
      await this.db.auditLog.create({ data: { action: 'payment.webhook_bad_signature', meta: { eventId: eventId ?? null } } });
      throw new BadRequestException('Invalid webhook signature');
    }
    let body: any;
    try { body = JSON.parse(rawBody.toString('utf8')); } catch { throw new BadRequestException('Invalid webhook body'); }
    const event = String(body?.event ?? '');
    const payment = body?.payload?.payment?.entity;
    const id = eventId ?? `${event}:${payment?.id ?? body?.payload?.order?.entity?.id ?? 'unknown'}`;
    if (await this.db.webhookEvent.findFirst({ where: { eventId: id }, select: { id: true } })) return { ok: true, duplicate: true };
    try {
      await this.db.webhookEvent.create({ data: { tenantId: t.id, eventId: id, event } }); // the unique index catches a concurrent redelivery
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, duplicate: true };
      throw e;
    }
    let outcome = 'ignored';
    if ((event === 'payment.captured' || event === 'payment.authorized' || event === 'order.paid') && payment?.order_id) {
      const row = await this.db.payment.findFirst({ where: { providerOrderId: String(payment.order_id) } });
      if (row && Number(payment.amount) === row.amount && String(payment.currency ?? 'INR') === row.currency) {
        const changed = await this.markPaid(row.id, { providerPaymentId: String(payment.id), method: payment.method ? String(payment.method) : null, via: 'webhook' }, null);
        outcome = changed ? 'paid' : 'already_paid';
      } else outcome = row ? 'amount_mismatch' : 'unknown_order';
    } else if (event === 'payment.failed' && payment?.order_id) {
      const row = await this.db.payment.findFirst({ where: { providerOrderId: String(payment.order_id) } });
      if (row && row.status === 'PENDING') {
        await this.db.payment.update({ where: { id: row.id }, data: { failureReason: String(payment.error_description ?? payment.error_code ?? 'failed').slice(0, 200) } });
        outcome = 'failure_noted';
      }
    }
    await this.db.webhookEvent.updateMany({ where: { tenantId: t.id, eventId: id }, data: { processedAt: new Date(), outcome } });
    return { ok: true, ...(outcome === 'ignored' ? { ignored: event } : {}) };
  }

  /** Idempotent: flips payment + order to PAID once; the first caller sends the notifications. Returns true if it changed anything. */
  async markPaid(paymentId: string, info: { providerPaymentId: string; method: string | null; via: 'signature' | 'webhook' }, host: string | null): Promise<boolean> {
    const t = this.tenant();
    const result = await this.db.$transaction(async (tx: any) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!p) return null;
      const flipped = await tx.payment.updateMany({ where: { id: paymentId, status: { not: 'PAID' } }, data: { status: 'PAID', providerPaymentId: info.providerPaymentId, method: info.method, verifiedVia: info.via } });
      if (flipped.count !== 1) return null;
      await tx.order.updateMany({ where: { id: p.orderId, paymentStatus: { not: 'PAID' } }, data: { paymentStatus: 'PAID', paidAt: new Date(), expiresAt: null } });
      // an order cancelled by the expiry job a moment before the money arrived: reopen it and take the stock again
      const o = await tx.order.findUnique({ where: { id: p.orderId }, include: { customer: true } });
      if (o.orderStatus === 'CANCELLED') {
        await tx.order.update({ where: { id: o.id }, data: { orderStatus: 'PENDING' } });
        for (const it of (o.items as any[])) {
          if (it.variantId) await tx.variant.updateMany({ where: { id: it.variantId }, data: { stock: { decrement: it.qty } } });
          else if (it.productId) await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { decrement: it.qty } } });
        }
      }
      await tx.auditLog.create({ data: { action: 'order.payment', meta: { orderId: o.id, from: 'PENDING', to: 'PAID', via: info.via, providerPaymentId: info.providerPaymentId } } });
      return o;
    });
    if (!result) return false;
    const h = host ?? (t.customDomain ?? `${t.subdomain}.${this.cfg.rootDomain}`);
    const token = orderToken(this.cfg.jwtAccessSecret, t.id, result.orderNo, result.customer.phone);
    await this.notifications.orderPlaced({ ...result, paymentStatus: 'PAID' }, { name: result.customer.name, phone: result.customer.phone, email: result.customer.email }, this.checkout.urls(h, result.orderNo, token));
    return true;
  }
}
