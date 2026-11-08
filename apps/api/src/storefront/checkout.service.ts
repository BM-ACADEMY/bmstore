import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Order, PaymentMode, Prisma } from '@prisma/client';
import { RequestContext, TenantInfo } from '../common/request-context';
import { AppConfig } from '../config/app-config';
import { TenantSecretsService } from '../crypto/tenant-secrets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderItem, parseItems } from '../orders/order-items';
import { PrismaService } from '../prisma/prisma.service';
import { CartItemDto, CheckoutDto, QuoteDto } from './checkout.dto';
import { normalizePhone, stateCodeFromGstin, stateCodeOf } from './india';
import { orderToken, orderTokenValid } from './order-token';
import { OtpService } from './otp';
import { assertCouponUsable, computeTotals, CouponRule, PricingError, splitGst, Totals } from './pricing';
import { RazorpayService } from './razorpay.service';

interface Line { item: CartItemDto; product: { id: string; name: string; slug: string; price: number; sku: string | null; images: string[]; hsnCode: string | null; gstRateBp: number | null; stock: number; status: string }; variant: { id: string; optionName: string; optionValue: string; priceDelta: number; stock: number; sku: string | null } | null; unitPrice: number }

export interface PlacedOrder {
  orderNo: string; orderId: string; total: number; paymentMode: PaymentMode; paymentStatus: string; token: string;
  razorpay?: { keyId: string; orderId: string; amount: number; currency: string; name: string; prefill: { name: string; contact: string; email?: string }; notes: Record<string, string> };
}

const pricingToHttp = (e: unknown) => (e instanceof PricingError ? new BadRequestException(e.message) : e);

/**
 * Guest checkout. Everything money-related is recomputed here from the database: the browser sends ids and
 * quantities only. The order, its stock decrements, the customer upsert and the order number are one transaction.
 */
@Injectable()
export class CheckoutService {
  private readonly log = new Logger(CheckoutService.name);
  constructor(
    private readonly prisma: PrismaService, private readonly cfg: AppConfig, private readonly secrets: TenantSecretsService,
    private readonly razorpay: RazorpayService, private readonly otp: OtpService, private readonly notifications: NotificationsService,
  ) {}
  private get db() { return this.prisma.db; }
  private tenant(): TenantInfo { const t = RequestContext.get()?.tenant; if (!t) throw new NotFoundException('Store not found'); return t; }

  // ---- building blocks ---------------------------------------------------------------------------
  private async settings() {
    return this.db.settings.upsert({ where: { tenantId: this.tenant().id }, create: { tenantId: this.tenant().id }, update: {} });
  }

  /** Resolve cart ids against live catalogue rows; merges duplicate lines. */
  private async lines(items: CartItemDto[]): Promise<Line[]> {
    const merged = new Map<string, CartItemDto>();
    for (const it of items) {
      const k = `${it.productId}:${it.variantId ?? ''}`;
      const cur = merged.get(k);
      merged.set(k, cur ? { ...cur, qty: cur.qty + it.qty } : { ...it, variantId: it.variantId ?? null });
    }
    const list = [...merged.values()];
    const products = await this.db.product.findMany({ where: { id: { in: list.map((i) => i.productId) }, status: 'ACTIVE' }, include: { variants: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    return list.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new BadRequestException('One of the items is no longer available');
      const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) ?? null : null;
      if (item.variantId && !variant) throw new BadRequestException(`That option of ${product.name} is no longer available`);
      if (!item.variantId && product.variants.length) throw new BadRequestException(`Please choose an option for ${product.name}`);
      return { item, product, variant, unitPrice: product.price + (variant?.priceDelta ?? 0) };
    });
  }

  private async coupon(code: string | null | undefined, subtotal: number): Promise<CouponRule | null> {
    const c = code?.trim().toUpperCase();
    if (!c) return null;
    const row = await this.db.coupon.findFirst({ where: { code: c } });
    if (!row) throw new BadRequestException('That coupon code is not valid');
    const used = await this.db.order.count({ where: { couponCode: c, orderStatus: { not: 'CANCELLED' } } });
    try { assertCouponUsable(row, subtotal, used); } catch (e) { throw pricingToHttp(e); }
    return row;
  }

  private async totals(lines: Line[], city: string | null, couponCode: string | null | undefined, paymentMode: PaymentMode): Promise<{ totals: Totals; coupon: CouponRule | null; settings: Awaited<ReturnType<CheckoutService['settings']>> }> {
    const settings = await this.settings();
    const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.item.qty, 0);
    const coupon = await this.coupon(couponCode, subtotal);
    try {
      const totals = computeTotals({
        lines: lines.map((l) => ({ key: `${l.product.id}:${l.variant?.id ?? ''}`, unitPrice: l.unitPrice, qty: l.item.qty, gstRateBp: l.product.gstRateBp ?? settings.gstRateBp })),
        shipping: { mode: settings.shippingMode, flatRate: settings.flatRate, freeAbove: settings.freeAbove, cityRates: (settings.cityRates as any[]) ?? [] },
        city, coupon, paymentMode, cod: { enabled: settings.codEnabled, charge: settings.codCharge }, gstRegistered: Boolean(this.tenant().gstNumber),
      });
      return { totals, coupon, settings };
    } catch (e) { throw pricingToHttp(e); }
  }

  private present(lines: Line[], totals: Totals) {
    return {
      items: lines.map((l, i) => ({ productId: l.product.id, variantId: l.variant?.id ?? null, name: l.product.name, slug: l.product.slug, image: l.product.images[0] ?? null, variantLabel: l.variant ? `${l.variant.optionName}: ${l.variant.optionValue}` : null, qty: l.item.qty, unitPrice: l.unitPrice, total: totals.lines[i].total, available: (l.variant ? l.variant.stock : l.product.stock) >= l.item.qty })),
      subtotal: totals.subtotal, discount: totals.discount, shipping: totals.shipping, shippingReason: totals.shippingReason, codCharge: totals.codCharge, tax: totals.tax, total: totals.total,
    };
  }

  // ---- public operations -------------------------------------------------------------------------
  async quote(dto: QuoteDto) {
    const lines = await this.lines(dto.items);
    const mode = dto.paymentMode ?? 'COD';
    const { totals, coupon } = await this.totals(lines, dto.city ?? null, dto.couponCode, mode);
    const rzp = await this.secrets.getRazorpayCredentials().catch(() => null);
    return { ...this.present(lines, totals), coupon: coupon ? { code: coupon.code, type: coupon.type, value: coupon.value } : null, paymentMode: mode, payments: { cod: (await this.settings()).codEnabled, online: Boolean(rzp) } };
  }

  async place(dto: CheckoutDto, host: string): Promise<PlacedOrder> {
    const t = this.tenant();
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
    const email = dto.email?.trim().toLowerCase() || null;
    const lines = await this.lines(dto.items);
    const { totals, coupon, settings } = await this.totals(lines, dto.address.city, dto.couponCode, dto.paymentMode);
    const creds = dto.paymentMode === 'ONLINE' ? await this.secrets.getRazorpayCredentials() : null;
    if (dto.paymentMode === 'ONLINE' && !creds) throw new ServiceUnavailableException('Online payment is not available at this store yet, choose cash on delivery');
    const phoneVerified = this.otp.isPhoneVerified(phone, dto.phoneToken ?? undefined);
    const threshold = settings.lowStockThreshold;

    const items: OrderItem[] = lines.map((l, i) => ({
      productId: l.product.id, variantId: l.variant?.id ?? null, name: l.product.name, sku: l.variant?.sku ?? l.product.sku, qty: l.item.qty, unitPrice: l.unitPrice,
      total: totals.lines[i].total, image: l.product.images[0] ?? null, variantLabel: l.variant ? `${l.variant.optionName}: ${l.variant.optionValue}` : null,
      hsnCode: l.product.hsnCode, gstRateBp: totals.lines[i].gstRateBp, tax: totals.lines[i].tax,
    }));
    const address = { name: dto.name.trim(), phone, email, line1: dto.address.line1.trim(), line2: dto.address.line2?.trim() || null, city: dto.address.city.trim(), state: dto.address.state, pincode: dto.address.pincode, stateCode: stateCodeOf(dto.address.state), phoneVerified };
    const crossed: Array<{ name: string; stock: number; variantLabel?: string | null }> = [];

    let order: Order;
    try {
      order = await this.db.$transaction(async (tx: any) => {
        // 1. stock: conditional decrements, one row each; a 0-row update means someone else got there first
        for (const l of lines) {
          const qty = l.item.qty;
          if (l.variant) {
            const r = await tx.variant.updateMany({ where: { id: l.variant.id, productId: l.product.id, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
            if (r.count !== 1) throw new ConflictException(`Sorry, ${l.product.name} (${l.variant.optionValue}) just went out of stock`);
            const after = await tx.variant.findUnique({ where: { id: l.variant.id }, select: { stock: true } });
            if (after && after.stock <= threshold && after.stock + qty > threshold) crossed.push({ name: l.product.name, stock: after.stock, variantLabel: `${l.variant.optionName}: ${l.variant.optionValue}` });
          } else {
            const r = await tx.product.updateMany({ where: { id: l.product.id, status: 'ACTIVE', stock: { gte: qty } }, data: { stock: { decrement: qty } } });
            if (r.count !== 1) throw new ConflictException(`Sorry, ${l.product.name} just went out of stock`);
            const after = await tx.product.findUnique({ where: { id: l.product.id }, select: { stock: true } });
            if (after && after.stock <= threshold && after.stock + qty > threshold) crossed.push({ name: l.product.name, stock: after.stock });
          }
        }
        // 2. customer by phone (guest checkout: no account, the phone is the identity)
        const existing = await tx.customer.findUnique({ where: { tenantId_phone: { tenantId: t.id, phone } } });
        const book = Array.isArray(existing?.addresses) ? (existing!.addresses as any[]) : [];
        const entry = { label: 'Home', line1: address.line1, line2: address.line2, city: address.city, state: address.state, pincode: address.pincode };
        const addresses = [entry, ...book.filter((a) => !(a?.line1 === entry.line1 && a?.pincode === entry.pincode))].slice(0, 5);
        const customer = existing
          ? await tx.customer.update({ where: { id: existing.id }, data: { name: address.name, ...(email ? { email } : {}), addresses } })
          : await tx.customer.create({ data: { tenantId: t.id, name: address.name, phone, email, addresses } });
        // 3. order number under the settings row lock: "<prefix>-<seq>", unique per tenant (also enforced by the DB)
        const s = await tx.settings.update({ where: { tenantId: t.id }, data: { nextOrderSeq: { increment: 1 } }, select: { nextOrderSeq: true, orderPrefix: true, unpaidOrderTtlMin: true } });
        const orderNo = `${s.orderPrefix}-${s.nextOrderSeq - 1}`;
        const o: Order = await tx.order.create({ data: {
          tenantId: t.id, orderNo, customerId: customer.id, items: items as unknown as Prisma.InputJsonValue,
          subtotal: totals.subtotal, discount: totals.discount, couponCode: coupon?.code ?? null, shipping: totals.shipping, codCharge: totals.codCharge, tax: totals.tax, total: totals.total,
          paymentMode: dto.paymentMode, paymentStatus: 'PENDING', orderStatus: 'PENDING', address, customerNote: dto.note?.trim() || null,
          expiresAt: dto.paymentMode === 'ONLINE' ? new Date(Date.now() + s.unpaidOrderTtlMin * 60_000) : null,
        } });
        await tx.auditLog.create({ data: { action: 'order.placed', meta: { orderId: o.id, orderNo, paymentMode: dto.paymentMode, total: totals.total, phoneVerified } } });
        return o;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Please try placing the order again');
      throw e;
    }

    const token = orderToken(this.cfg.jwtAccessSecret, t.id, order.orderNo, phone);
    const urls = this.urls(host, order.orderNo, token);
    const out: PlacedOrder = { orderNo: order.orderNo, orderId: order.id, total: order.total, paymentMode: order.paymentMode, paymentStatus: order.paymentStatus, token };

    if (dto.paymentMode === 'ONLINE') {
      let rzp;
      try {
        rzp = await this.razorpay.createOrder(creds!, { amount: order.total, receipt: order.orderNo, notes: { order_no: order.orderNo, store: t.slug } });
      } catch (e) {
        await this.cancelAndRestock(order.id, 'gateway order failed');
        throw e;
      }
      await this.db.payment.create({ data: { tenantId: t.id, orderId: order.id, providerOrderId: rzp.id, amount: order.total, currency: 'INR' } });
      out.razorpay = { keyId: creds!.keyId, orderId: rzp.id, amount: order.total, currency: 'INR', name: t.name, prefill: { name: address.name, contact: `+91${phone}`, ...(email ? { email } : {}) }, notes: { order_no: order.orderNo } };
    } else {
      await this.notifications.orderPlaced(order, { name: address.name, phone, email }, urls);
    }
    if (crossed.length) await this.notifications.lowStock(crossed);
    return out;
  }

  /** Cancel an order that never got paid (or whose gateway order failed) and put its stock back. Idempotent. */
  async cancelAndRestock(orderId: string, reason: string): Promise<boolean> {
    return this.db.$transaction(async (tx: any) => {
      const r = await tx.order.updateMany({ where: { id: orderId, orderStatus: 'PENDING', paymentStatus: { in: ['PENDING', 'FAILED'] } }, data: { orderStatus: 'CANCELLED' } });
      if (r.count !== 1) return false;
      const o = await tx.order.findUnique({ where: { id: orderId } });
      for (const it of parseItems(o.items)) {
        if (it.variantId) await tx.variant.updateMany({ where: { id: it.variantId }, data: { stock: { increment: it.qty } } });
        else if (it.productId) await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { increment: it.qty } } });
      }
      await tx.auditLog.create({ data: { action: 'order.status', meta: { orderId, from: 'PENDING', to: 'CANCELLED', note: reason } } });
      return true;
    });
  }

  urls(host: string, orderNo: string, token: string) {
    const proto = host.endsWith('.localhost') || host.startsWith('localhost') || /^127\./.test(host) ? 'http' : 'https';
    const base = `${proto}://${host}`;
    return { storeUrl: base, trackUrl: `${base}/order/${encodeURIComponent(orderNo)}?t=${token}`, invoiceUrl: `${base}/api/storefront/orders/${encodeURIComponent(orderNo)}/invoice?t=${token}` };
  }

  /** The order as its customer may see it. Requires the phone used at checkout or the token issued at checkout. */
  async lookup(orderNoRaw: string, opts: { phone?: string; token?: string }, host: string) {
    const t = this.tenant();
    const orderNo = orderNoRaw.trim().toUpperCase();
    const o = await this.db.order.findUnique({ where: { tenantId_orderNo: { tenantId: t.id, orderNo } }, include: { customer: { select: { name: true, phone: true, email: true } }, payments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    const phone = opts.phone ? normalizePhone(opts.phone) : null;
    const tokenOk = o ? orderTokenValid(this.cfg.jwtAccessSecret, t.id, orderNo, o.customer.phone, opts.token) : false;
    if (!o || !(tokenOk || (phone && phone === o.customer.phone))) throw new NotFoundException('We could not find an order with those details');
    const token = orderToken(this.cfg.jwtAccessSecret, t.id, orderNo, o.customer.phone);
    const addr = o.address as any;
    const payment = o.payments[0] ?? null;
    const canPay = o.paymentMode === 'ONLINE' && o.paymentStatus !== 'PAID' && o.orderStatus === 'PENDING' && (!o.expiresAt || o.expiresAt > new Date()) && payment;
    const creds = canPay ? await this.secrets.getRazorpayCredentials().catch(() => null) : null;
    const gst = splitGst(o.tax, stateCodeFromGstin(t.gstNumber), addr?.stateCode ?? null);
    return {
      orderNo: o.orderNo, createdAt: o.createdAt, orderStatus: o.orderStatus, paymentMode: o.paymentMode, paymentStatus: o.paymentStatus, paidAt: o.paidAt,
      items: parseItems(o.items), subtotal: o.subtotal, discount: o.discount, couponCode: o.couponCode, shipping: o.shipping, codCharge: o.codCharge, tax: o.tax, total: o.total, gst,
      customer: { name: o.customer.name, phone: `${o.customer.phone.slice(0, 2)}******${o.customer.phone.slice(-2)}` },
      address: { line1: addr?.line1, line2: addr?.line2, city: addr?.city, state: addr?.state, pincode: addr?.pincode },
      token, invoiceUrl: this.urls(host, o.orderNo, token).invoiceUrl, expiresAt: o.expiresAt,
      razorpay: canPay && creds ? { keyId: creds.keyId, orderId: payment!.providerOrderId, amount: payment!.amount, currency: payment!.currency, name: t.name, prefill: { name: o.customer.name, contact: `+91${o.customer.phone}`, ...(o.customer.email ? { email: o.customer.email } : {}) }, notes: { order_no: o.orderNo } } : null,
    };
  }
}
