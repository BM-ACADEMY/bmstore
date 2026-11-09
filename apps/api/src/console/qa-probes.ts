import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { RequestContext, TenantInfo } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutService } from '../storefront/checkout.service';
import { InvoiceService } from '../storefront/invoice.service';
import { STATE_NAMES } from '../storefront/india';
import { TENANT_PUBLIC_SELECT } from '../tenancy/tenant-resolver.service';

/**
 * Checks that need the storefront (apps/storefront + the /storefront API, S3). The QA runner talks to this interface.
 * A method throws ProbeSkipped when the check cannot run on this server (recorded as "skipped" with the reason).
 */
export interface StorefrontTarget { tenantId: string; host: string; url: string }

export class ProbeSkipped extends Error {}

export abstract class StorefrontProbe {
  /** Places a real order through the checkout service (COD when the store allows it). */
  abstract placeTestOrder(t: StorefrontTarget): Promise<{ orderNo: string; orderId: string; totalPaise: number }>;
  /** Renders the customer's GST invoice PDF for that order. */
  abstract fetchInvoice(t: StorefrontTarget, orderNo: string): Promise<{ invoiceNo: string; totalPaise: number; bytes: number }>;
  /** Cancels the test order and puts its stock back. Always called after the order checks. */
  abstract cleanup(t: StorefrontTarget, orderId: string): Promise<void>;
  /** Lighthouse mobile performance score (0-100) for the store URL. */
  abstract lighthouseMobile(t: StorefrontTarget): Promise<{ performance: number }>;
}

/** The test order's shopper: the store's own WhatsApp number, so order messages reach nobody else. */
export const QA_ORDER_NAME = 'QA test order';
export const QA_ORDER_NOTE = 'Automated QA order from the developer console. Cancelled and restocked automatically; do not ship.';

/**
 * Runs the order checks IN PROCESS through the storefront's own services (CheckoutService.place, InvoiceService), in the
 * store's tenant scope with the same tenant context a storefront request gets: same pricing, stock, GST and invoice code
 * paths as a shopper, without depending on the storefront web server being reachable from the API.
 * Lighthouse needs Chrome + the Lighthouse CLI (LIGHTHOUSE_BIN, CHROME_PATH) and the storefront at the store URL.
 */
@Injectable()
export class InProcessStorefrontProbe extends StorefrontProbe {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly invoices: InvoiceService,
    private readonly cfg: AppConfig,
  ) { super(); }

  private async asStore<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    const row = await this.prisma.runAsTenant(tenantId, () => this.prisma.db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: TENANT_PUBLIC_SELECT }));
    const tenant: TenantInfo = { ...row, expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null };
    const cur = RequestContext.get();
    return RequestContext.run({ requestId: cur?.requestId ?? randomUUID(), tenantId, tenant, actor: cur?.actor }, async () => await fn());
  }

  placeTestOrder(t: StorefrontTarget) {
    return this.asStore(t.tenantId, async () => {
      const db = this.prisma.db;
      const product = await db.product.findFirst({ where: { status: 'ACTIVE', stock: { gte: 1 } }, orderBy: { price: 'asc' }, select: { id: true } });
      if (!product) throw new Error('No live product in stock to order: import products (status ACTIVE, stock > 0) first');
      const settings = await db.settings.findUnique({ where: { tenantId: t.tenantId } });
      const tenant = RequestContext.get()!.tenant!;
      const phone = (tenant.whatsappNumber ?? tenant.supportPhone ?? '').replace(/\D/g, '').slice(-10);
      if (phone.length !== 10) throw new Error('The store needs a WhatsApp number (used as the test shopper)');
      const placed = await this.checkout.place({
        items: [{ productId: product.id, variantId: null, qty: 1 }],
        name: QA_ORDER_NAME, phone, email: null,
        address: { line1: 'QA test, do not ship', line2: null, city: 'Chennai', state: STATE_NAMES.includes('Tamil Nadu') ? 'Tamil Nadu' : STATE_NAMES[0], pincode: '600001' },
        paymentMode: settings?.codEnabled === false ? 'ONLINE' : 'COD',
        note: QA_ORDER_NOTE, couponCode: null, phoneToken: null,
      } as any, t.host);
      return { orderNo: placed.orderNo, orderId: placed.orderId, totalPaise: placed.total };
    });
  }

  fetchInvoice(t: StorefrontTarget, orderNo: string) {
    return this.asStore(t.tenantId, async () => {
      const data = await this.invoices.load({ orderNo });
      const pdf = await this.invoices.render(data);
      if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-' || pdf.length < 1000) throw new Error('Invoice is not a valid PDF');
      return { invoiceNo: data.order.orderNo, totalPaise: data.order.total, bytes: pdf.length };
    });
  }

  async cleanup(t: StorefrontTarget, orderId: string) {
    await this.asStore(t.tenantId, async () => { await this.checkout.cancelAndRestock(orderId, 'QA test order'); });
  }

  lighthouseMobile(t: StorefrontTarget): Promise<{ performance: number }> {
    const bin = this.cfg.lighthouseBin;
    if (!bin) return Promise.reject(new ProbeSkipped('skipped: Lighthouse not installed on this server (set LIGHTHOUSE_BIN and CHROME_PATH)'));
    const args = [t.url, '--form-factor=mobile', '--screenEmulation.mobile', '--only-categories=performance', '--output=json', '--output-path=stdout', '--quiet', '--chrome-flags=--headless=new --no-sandbox'];
    return new Promise((resolve, reject) => {
      execFile(bin, args, { timeout: 180_000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...(this.cfg.chromePath ? { CHROME_PATH: this.cfg.chromePath } : {}) } }, (err, stdout) => {
        if (err) return reject(new Error(`Lighthouse could not run (${(err as any).code ?? err.name})`));
        try {
          const score = JSON.parse(stdout)?.categories?.performance?.score;
          if (typeof score !== 'number') return reject(new Error('Lighthouse returned no performance score'));
          resolve({ performance: Math.round(score * 100) });
        } catch { reject(new Error('Lighthouse output was not JSON')); }
      });
    });
  }
}

/** Verifies a store's Razorpay key pair with a harmless read. The secret only ever goes into the Authorization header. */
export abstract class RazorpayProbe {
  abstract verify(keyId: string, keySecret: string): Promise<{ ok: boolean; detail: string }>;
}

@Injectable()
export class HttpRazorpayProbe extends RazorpayProbe {
  constructor(private readonly cfg: AppConfig) { super(); }
  async verify(keyId: string, keySecret: string) {
    try {
      const r = await fetch(`${this.cfg.razorpayApiBase}/v1/payments?count=1`, {
        headers: { authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) return { ok: true, detail: 'Razorpay accepted the keys' };
      if (r.status === 401) return { ok: false, detail: 'Razorpay rejected the keys (401): check the key id and secret' };
      return { ok: false, detail: `Razorpay answered ${r.status}` };
    } catch (e: any) {
      return { ok: false, detail: `Could not reach Razorpay (${e?.name === 'TimeoutError' ? 'timed out' : 'network error'})` };
    }
  }
}
