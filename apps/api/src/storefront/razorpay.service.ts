import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config/app-config';

export interface RzpOrder { id: string; amount: number; currency: string; receipt?: string; status: string }
export interface RzpPayment { id: string; order_id: string; amount: number; currency: string; status: string; method?: string; error_description?: string | null }

/**
 * Razorpay REST client. Credentials are passed per call: they belong to the TENANT (decrypted by TenantSecretsService
 * inside the request), never to the process. Nothing here logs keys, secrets, signatures or payloads.
 */
@Injectable()
export class RazorpayService {
  private readonly log = new Logger(RazorpayService.name);
  constructor(private readonly cfg: AppConfig) {}

  private async call<T>(creds: { keyId: string; keySecret: string }, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
    let res: Response;
    try {
      res = await fetch(`${this.cfg.razorpayApiBase}${path}`, {
        method, headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json', accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      this.log.warn(`razorpay ${method} ${path} failed: ${(e as Error).name}`);
      throw new BadGatewayException('The payment service could not be reached, please try again');
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    if (!res.ok) {
      this.log.warn(`razorpay ${method} ${path} -> ${res.status} ${json?.error?.code ?? ''}`);
      throw new BadGatewayException(res.status === 401 ? 'The store\'s payment keys were refused by Razorpay' : 'The payment service rejected the request, please try again');
    }
    return json as T;
  }

  /** Create a gateway order for one of ours. `receipt` = our order number; amount in paise. */
  createOrder(creds: { keyId: string; keySecret: string }, input: { amount: number; receipt: string; notes?: Record<string, string> }): Promise<RzpOrder> {
    return this.call<RzpOrder>(creds, 'POST', '/v1/orders', { amount: input.amount, currency: 'INR', receipt: input.receipt, payment_capture: 1, notes: input.notes ?? {} });
  }

  fetchPayment(creds: { keyId: string; keySecret: string }, paymentId: string): Promise<RzpPayment> {
    return this.call<RzpPayment>(creds, 'GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
  }

  /** Checkout callback signature: HMAC-SHA256(order_id|payment_id, key_secret). */
  static verifyPaymentSignature(keySecret: string, orderId: string, paymentId: string, signature: string): boolean {
    return hmacEquals(keySecret, `${orderId}|${paymentId}`, signature);
  }
  /** Webhook signature: HMAC-SHA256(raw body, webhook secret), header X-Razorpay-Signature. */
  static verifyWebhookSignature(webhookSecret: string, rawBody: Buffer | string, signature: string): boolean {
    return hmacEquals(webhookSecret, rawBody, signature);
  }
  static sign(secret: string, payload: Buffer | string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }
}

function hmacEquals(secret: string, payload: Buffer | string, signature: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const a = Buffer.from(RazorpayService.sign(secret, payload), 'hex');
  const b = Buffer.from(signature, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
