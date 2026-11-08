import { TenantPlan, TenantStatus } from '@prisma/client';

/** Plan limits. STARTER's cap counts DRAFT + ACTIVE products (archived ones free a slot); ALSO enforced by a DB trigger. */
export const PLAN_LIMITS: Record<TenantPlan, { maxProducts: number | null }> = {
  STARTER: { maxProducts: 10 },
  STANDARD: { maxProducts: null }, // unlimited within fair use
};

/** Error text raised by the trigger when the cap is hit. */
export const PLAN_LIMIT_ERROR = /plan_limit_exceeded/;

/**
 * Which tenant statuses answer requests on the store host at all.
 * BUILDING: the store is being set up; its admins can log in and work and the storefront is served as a PREVIEW
 * (X-Robots-Tag noindex, robots meta tag, ribbon: see preview.ts), so it is never indexed before go-live.
 */
export const SERVES_REQUESTS: Record<TenantStatus, boolean> = {
  BUILDING: true,
  LIVE: true,
  SUSPENDED: false,
  PARKED: false,
};

export const BLOCKED_MESSAGE: Partial<Record<TenantStatus, string>> = {
  SUSPENDED: 'Store suspended',
  PARKED: 'Store parked',
};

/**
 * What a blocked store's visitors are told. The API answers 403 with `{ message, code, notice }` on every route of a
 * suspended / parked / expired store; the storefront renders `notice` as a full-page message. Plain words, no blame,
 * the store's own WhatsApp when it has one. Same text for every store (no client-specific copy).
 */
export interface StoreNotice { code: 'store_suspended' | 'store_parked' | 'store_expired'; title: string; body: string; whatsapp: string | null }
export function storeNotice(kind: 'SUSPENDED' | 'PARKED' | 'EXPIRED', storeName: string, whatsapp: string | null): StoreNotice {
  const contact = whatsapp ? ' You can reach the store on WhatsApp.' : '';
  switch (kind) {
    case 'EXPIRED': return { code: 'store_expired', title: `${storeName} is taking a short break`, body: `This store is not taking orders right now. Please check back soon.${contact}`, whatsapp };
    case 'PARKED': return { code: 'store_parked', title: `${storeName} is not open yet`, body: `This store is still being set up.${contact}`, whatsapp };
    default: return { code: 'store_suspended', title: `${storeName} is unavailable`, body: `This store is not taking orders right now.${contact}`, whatsapp };
  }
}
