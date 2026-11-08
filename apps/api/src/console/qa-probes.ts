import { Injectable } from '@nestjs/common';

/**
 * Checks that need the public storefront (apps/storefront, built in parallel by S3). Written against this interface;
 * until the storefront is merged the default implementation reports `available = false` and the QA runner records
 * those checks as "skipped: storefront not merged". When it lands, provide an HttpStorefrontProbe:
 *  - placeTestOrder: create a COD test order through the storefront's checkout API on the store host,
 *  - fetchInvoice:   download the invoice for that order and confirm it has a number and the right total,
 *  - lighthouseMobile: run Lighthouse (mobile preset) against the store URL and return the performance score (0-100).
 */
export interface StorefrontTarget { tenantId: string; host: string; url: string }

export abstract class StorefrontProbe {
  abstract readonly available: boolean;
  abstract placeTestOrder(t: StorefrontTarget): Promise<{ orderNo: string; totalPaise: number }>;
  abstract fetchInvoice(t: StorefrontTarget, orderNo: string): Promise<{ invoiceNo: string; totalPaise: number }>;
  abstract lighthouseMobile(t: StorefrontTarget): Promise<{ performance: number }>;
}

@Injectable()
export class UnmergedStorefrontProbe extends StorefrontProbe {
  readonly available = false;
  placeTestOrder(): Promise<never> { return Promise.reject(new Error('storefront not merged')); }
  fetchInvoice(): Promise<never> { return Promise.reject(new Error('storefront not merged')); }
  lighthouseMobile(): Promise<never> { return Promise.reject(new Error('storefront not merged')); }
}

/** Verifies a store's Razorpay key pair with a harmless read. The secret only ever goes into the Authorization header. */
export abstract class RazorpayProbe {
  abstract verify(keyId: string, keySecret: string): Promise<{ ok: boolean; detail: string }>;
}

@Injectable()
export class HttpRazorpayProbe extends RazorpayProbe {
  async verify(keyId: string, keySecret: string) {
    try {
      const r = await fetch('https://api.razorpay.com/v1/payments?count=1', {
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
