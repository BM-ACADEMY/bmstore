import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Proof that a shopper may see one order without an account: HMAC of (tenant, order number, phone) with the server
 * secret. Returned right after checkout (so the confirmation page needs no phone entry) and recomputed on lookup.
 */
export function orderToken(secret: string, tenantId: string, orderNo: string, phone: string): string {
  return createHmac('sha256', secret).update(`${tenantId}|${orderNo}|${phone}`).digest('base64url').slice(0, 32);
}
export function orderTokenValid(secret: string, tenantId: string, orderNo: string, phone: string, token: string | undefined): boolean {
  if (!token || token.length !== 32) return false;
  const a = Buffer.from(orderToken(secret, tenantId, orderNo, phone));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
