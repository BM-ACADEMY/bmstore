import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config';

export interface RefundResult { ok: boolean; refundId?: string; stub: boolean; error?: string }

/**
 * Money out. Razorpay refund API on the PLATFORM account (the client's setup fee), TEST MODE ONLY unless
 * RAZORPAY_ALLOW_LIVE_REFUNDS=1. Without platform keys it is a stub that returns a clearly marked fake refund id.
 * The key secret only ever goes into the Authorization header; it is never logged or returned.
 */
export abstract class RefundGateway {
  abstract refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<RefundResult>;
}

@Injectable()
export class RazorpayRefundGateway extends RefundGateway {
  private readonly log = new Logger('RefundGateway');
  constructor(private readonly cfg: AppConfig) { super(); }

  async refund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<RefundResult> {
    const keyId = this.cfg.platformRazorpayKeyId;
    const secret = this.cfg.platformRazorpayKeySecret;
    if (!keyId || !secret) {
      this.log.warn('refund (stub: PLATFORM_RAZORPAY_KEY_ID/SECRET not set)');
      return { ok: true, stub: true, refundId: `rfnd_stub_${Date.now().toString(36)}` };
    }
    if (!keyId.startsWith('rzp_test_') && !this.cfg.allowLiveRefunds) {
      return { ok: false, stub: false, error: 'Live Razorpay keys configured: refunds run in test mode only (set RAZORPAY_ALLOW_LIVE_REFUNDS=1 to allow live refunds)' };
    }
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return { ok: false, stub: false, error: 'Payment id must look like pay_XXXXXXXX' };
    try {
      const r = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: 'POST',
        headers: { authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ amount: amountPaise, speed: 'normal', notes }),
        signal: AbortSignal.timeout(15000),
      });
      const body: any = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, stub: false, error: `Razorpay ${r.status}: ${String(body?.error?.description ?? 'refund refused').slice(0, 200)}` };
      return { ok: true, stub: false, refundId: String(body.id) };
    } catch (e: any) {
      return { ok: false, stub: false, error: `Could not reach Razorpay (${e?.name === 'TimeoutError' ? 'timed out' : 'network error'})` };
    }
  }
}
