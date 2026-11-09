import type { CouponType, PaymentMode, ShippingMode } from '@prisma/client';

/**
 * Order arithmetic. Pure functions over integer paise: no floats, no Decimal, every rounding step explicit.
 * Prices in this platform are GST-INCLUSIVE (Indian retail convention): tax is a portion of the total, not on top.
 */
export interface PricingLine { key: string; unitPrice: number; qty: number; gstRateBp: number }
export interface ShippingRules { mode: ShippingMode; flatRate: number; freeAbove: number | null; cityRates: Array<{ city: string; ratePaise: number }> }
export interface CouponRule { code: string; type: CouponType; value: number; minOrder: number; usageLimit: number | null; expiresAt: Date | null }
export interface TotalsInput {
  lines: PricingLine[];
  shipping: ShippingRules;
  city: string | null;
  coupon: CouponRule | null;
  paymentMode: PaymentMode;
  cod: { enabled: boolean; charge: number };
  /** false when the store is not GST-registered: tax = 0 everywhere */
  gstRegistered: boolean;
}
export interface LineTotals { key: string; qty: number; unitPrice: number; total: number; discount: number; net: number; tax: number; gstRateBp: number }
export interface Totals { subtotal: number; discount: number; shipping: number; codCharge: number; tax: number; total: number; lines: LineTotals[]; shippingReason: 'city' | 'flat' | 'free' | 'free_above' }

export class PricingError extends Error {
  constructor(readonly code: 'EMPTY' | 'BAD_QTY' | 'COD_DISABLED' | 'COUPON_EXPIRED' | 'COUPON_MIN' | 'COUPON_LIMIT' | 'COUPON_INVALID' | 'TOO_LARGE', message: string) { super(message); }
}

const MAX_QTY = 50;
/** Amounts are 32-bit Int paise in the database (₹2,14,74,836.47). A single order above ₹2 crore is refused rather than overflow. */
const MAX_TOTAL = 2_000_000_000;

/** Shipping for a (post-discount) merchandise amount. City overrides win outright; FREE_ABOVE compares the discounted subtotal. */
export function shippingFor(rules: ShippingRules, merchandise: number, city: string | null): { amount: number; reason: Totals['shippingReason'] } {
  const c = city?.trim().toLowerCase();
  if (c) {
    const hit = rules.cityRates.find((r) => r.city.trim().toLowerCase() === c);
    if (hit) return { amount: Math.max(0, hit.ratePaise), reason: 'city' };
  }
  if (rules.mode === 'FREE') return { amount: 0, reason: 'free' };
  if (rules.mode === 'FREE_ABOVE' && rules.freeAbove !== null && merchandise >= rules.freeAbove) return { amount: 0, reason: 'free_above' };
  return { amount: Math.max(0, rules.flatRate), reason: 'flat' };
}

/** Throws a PricingError when the coupon cannot be used right now. */
export function assertCouponUsable(c: CouponRule, subtotal: number, usedCount: number, now = new Date()) {
  if (c.expiresAt && c.expiresAt <= now) throw new PricingError('COUPON_EXPIRED', 'This coupon has expired');
  if (c.usageLimit !== null && usedCount >= c.usageLimit) throw new PricingError('COUPON_LIMIT', 'This coupon has been used up');
  if (subtotal < c.minOrder) throw new PricingError('COUPON_MIN', `This coupon needs a minimum order of ₹${(c.minOrder / 100).toLocaleString('en-IN')}`);
  if (c.type === 'PERCENT' && (c.value <= 0 || c.value > 100)) throw new PricingError('COUPON_INVALID', 'This coupon is not valid');
}

/** Coupon discount on the merchandise subtotal: PERCENT floors to the paise; FLAT never exceeds the subtotal. */
export function discountFor(c: CouponRule | null, subtotal: number): number {
  if (!c || subtotal <= 0) return 0;
  if (c.type === 'PERCENT') return Math.floor((subtotal * c.value) / 100);
  return Math.min(Math.max(0, c.value), subtotal);
}

/** GST portion of an inclusive amount: amount - amount / (1 + rate). */
export function inclusiveTax(amount: number, rateBp: number): number {
  if (rateBp <= 0 || amount <= 0) return 0;
  return amount - Math.round((amount * 10_000) / (10_000 + rateBp));
}

export function computeTotals(input: TotalsInput): Totals {
  if (!input.lines.length) throw new PricingError('EMPTY', 'Your cart is empty');
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0 || l.qty > MAX_QTY) throw new PricingError('BAD_QTY', `Quantity must be between 1 and ${MAX_QTY}`);
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) throw new PricingError('BAD_QTY', 'Invalid price');
  }
  if (input.paymentMode === 'COD' && !input.cod.enabled) throw new PricingError('COD_DISABLED', 'Cash on delivery is not available at this store');

  const gross = input.lines.map((l) => l.unitPrice * l.qty);
  const subtotal = gross.reduce((a, b) => a + b, 0);
  const discount = discountFor(input.coupon, subtotal);

  // allocate the discount across lines in proportion to their value; the last line absorbs rounding so the sum is exact
  let allocated = 0;
  const lines: LineTotals[] = input.lines.map((l, i) => {
    const total = gross[i];
    const isLast = i === input.lines.length - 1;
    const d = isLast ? discount - allocated : subtotal ? Math.floor((discount * total) / subtotal) : 0;
    allocated += d;
    const net = total - d;
    const rate = input.gstRegistered ? l.gstRateBp : 0;
    return { key: l.key, qty: l.qty, unitPrice: l.unitPrice, total, discount: d, net, tax: inclusiveTax(net, rate), gstRateBp: rate };
  });

  const merchandise = subtotal - discount;
  const ship = shippingFor(input.shipping, merchandise, input.city);
  const codCharge = input.paymentMode === 'COD' ? Math.max(0, input.cod.charge) : 0;
  const tax = lines.reduce((a, l) => a + l.tax, 0);
  const total = merchandise + ship.amount + codCharge;
  if (subtotal > MAX_TOTAL || total > MAX_TOTAL) throw new PricingError('TOO_LARGE', 'This order is too large to place online, please contact the store');
  return { subtotal, discount, shipping: ship.amount, codCharge, tax, total, lines, shippingReason: ship.reason };
}

/** GST split for an invoice: same state as the seller -> CGST + SGST (half each), otherwise IGST. */
export function splitGst(tax: number, sellerStateCode: string | null, buyerStateCode: string | null): { cgst: number; sgst: number; igst: number; interState: boolean } {
  const inter = Boolean(sellerStateCode && buyerStateCode && sellerStateCode !== buyerStateCode);
  if (inter) return { cgst: 0, sgst: 0, igst: tax, interState: true };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0, interState: false };
}
