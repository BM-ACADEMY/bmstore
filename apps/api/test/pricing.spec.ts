/** Order arithmetic edge cases. Pure functions, integer paise. */
import { assertCouponUsable, computeTotals, discountFor, inclusiveTax, PricingError, shippingFor, splitGst, ShippingRules } from '../src/storefront/pricing';

const ship = (over: Partial<ShippingRules> = {}): ShippingRules => ({ mode: 'FLAT', flatRate: 7900, freeAbove: null, cityRates: [], ...over });
const base = { shipping: ship(), city: null, coupon: null, paymentMode: 'ONLINE' as const, cod: { enabled: true, charge: 4900 }, gstRegistered: true };
const line = (unitPrice: number, qty = 1, gstRateBp = 500, key = 'a') => ({ key, unitPrice, qty, gstRateBp });

describe('pricing', () => {
  describe('inclusive tax', () => {
    it.each([
      [99900, 500, 4757], // ₹999 @5% -> ₹47.57
      [100000, 1200, 10714], // ₹1,000 @12% -> ₹107.14
      [100, 500, 5], // ₹1 @5% -> 5 paise
      [1, 500, 0], // 1 paisa rounds to 0 tax
      [0, 500, 0],
      [50000, 0, 0], // exempt
      [100000, 10000, 50000], // 100%: half is tax
    ])('inclusiveTax(%i, %i bp) = %i', (amount, bp, tax) => expect(inclusiveTax(amount, bp)).toBe(tax));
    it('tax never exceeds the amount and is never negative', () => {
      for (const a of [0, 1, 2, 3, 99, 100, 101, 99999, 123456789]) for (const bp of [0, 1, 250, 500, 1200, 1800, 2800, 10000]) { const t = inclusiveTax(a, bp); expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(a); }
    });
  });

  describe('coupons', () => {
    const c = (over: any = {}) => ({ code: 'X', type: 'PERCENT' as const, value: 10, minOrder: 0, usageLimit: null, expiresAt: null, ...over });
    it('PERCENT floors to the paise; FLAT never exceeds the subtotal; nothing on an empty subtotal', () => {
      expect(discountFor(c({ value: 10 }), 199800)).toBe(19980);
      expect(discountFor(c({ value: 33 }), 1001)).toBe(330); // 330.33 -> 330
      expect(discountFor(c({ value: 100 }), 5000)).toBe(5000);
      expect(discountFor(c({ type: 'FLAT', value: 20000 }), 15000)).toBe(15000);
      expect(discountFor(c({ type: 'FLAT', value: 20000 }), 0)).toBe(0);
      expect(discountFor(null, 5000)).toBe(0);
    });
    it('expiry, usage limit, minimum order, bad percent', () => {
      expect(() => assertCouponUsable(c({ expiresAt: new Date(Date.now() - 1) }), 10000, 0)).toThrow(PricingError);
      expect(() => assertCouponUsable(c({ expiresAt: new Date(Date.now() + 60_000) }), 10000, 0)).not.toThrow();
      expect(() => assertCouponUsable(c({ usageLimit: 2 }), 10000, 2)).toThrow(/used up/);
      expect(() => assertCouponUsable(c({ usageLimit: 2 }), 10000, 1)).not.toThrow();
      expect(() => assertCouponUsable(c({ minOrder: 10001 }), 10000, 0)).toThrow(/minimum order/);
      expect(() => assertCouponUsable(c({ minOrder: 10000 }), 10000, 0)).not.toThrow(); // exactly the minimum is fine
      expect(() => assertCouponUsable(c({ value: 101 }), 10000, 0)).toThrow(/not valid/);
    });
  });

  describe('shipping', () => {
    it('FLAT / FREE / FREE_ABOVE and the exact threshold', () => {
      expect(shippingFor(ship(), 100, null)).toEqual({ amount: 7900, reason: 'flat' });
      expect(shippingFor(ship({ mode: 'FREE' }), 100, null)).toEqual({ amount: 0, reason: 'free' });
      expect(shippingFor(ship({ mode: 'FREE_ABOVE', freeAbove: 199900 }), 199899, null)).toEqual({ amount: 7900, reason: 'flat' });
      expect(shippingFor(ship({ mode: 'FREE_ABOVE', freeAbove: 199900 }), 199900, null)).toEqual({ amount: 0, reason: 'free_above' });
      expect(shippingFor(ship({ mode: 'FREE_ABOVE', freeAbove: null }), 999999, null)).toEqual({ amount: 7900, reason: 'flat' }); // misconfigured: falls back to flat
    });
    it('city override wins over every mode (case/space-insensitive) and may be zero', () => {
      const r = ship({ mode: 'FREE', cityRates: [{ city: 'Chennai', ratePaise: 4900 }, { city: 'Kanchipuram', ratePaise: 0 }] });
      expect(shippingFor(r, 10, ' chennai ')).toEqual({ amount: 4900, reason: 'city' });
      expect(shippingFor(r, 10, 'KANCHIPURAM')).toEqual({ amount: 0, reason: 'city' });
      expect(shippingFor(r, 10, 'Madurai')).toEqual({ amount: 0, reason: 'free' });
      expect(shippingFor(ship({ mode: 'FREE_ABOVE', freeAbove: 100, cityRates: [{ city: 'Ooty', ratePaise: 15000 }] }), 10_000_000, 'Ooty')).toEqual({ amount: 15000, reason: 'city' });
    });
  });

  describe('computeTotals', () => {
    it('plain order: subtotal + shipping; tax is carved out, not added', () => {
      const t = computeTotals({ ...base, lines: [line(99900, 2)] });
      expect(t).toMatchObject({ subtotal: 199800, discount: 0, shipping: 7900, codCharge: 0, total: 207700 });
      expect(t.tax).toBe(inclusiveTax(199800, 500));
      expect(t.lines[0]).toMatchObject({ total: 199800, net: 199800, discount: 0 });
    });
    it('COD charge only for COD; COD disabled -> error', () => {
      expect(computeTotals({ ...base, lines: [line(10000)], paymentMode: 'COD' }).codCharge).toBe(4900);
      expect(computeTotals({ ...base, lines: [line(10000)], paymentMode: 'COD', cod: { enabled: true, charge: 0 } }).codCharge).toBe(0);
      expect(() => computeTotals({ ...base, lines: [line(10000)], paymentMode: 'COD', cod: { enabled: false, charge: 4900 } })).toThrow(/not available/);
    });
    it('discount is allocated across lines proportionally with the remainder on the last line; line taxes sum to the order tax', () => {
      const coupon = { code: 'TEN', type: 'PERCENT' as const, value: 10, minOrder: 0, usageLimit: null, expiresAt: null };
      const t = computeTotals({ ...base, coupon, lines: [line(33333, 1, 500, 'a'), line(33333, 1, 1200, 'b'), line(33334, 1, 0, 'c')] });
      expect(t.subtotal).toBe(100000);
      expect(t.discount).toBe(10000);
      expect(t.lines.map((l) => l.discount)).toEqual([3333, 3333, 3334]);
      expect(t.lines.reduce((n, l) => n + l.discount, 0)).toBe(t.discount);
      expect(t.lines.reduce((n, l) => n + l.net, 0)).toBe(90000);
      expect(t.lines.map((l) => l.tax)).toEqual([inclusiveTax(30000, 500), inclusiveTax(30000, 1200), 0]);
      expect(t.tax).toBe(t.lines.reduce((n, l) => n + l.tax, 0));
      expect(t.total).toBe(90000 + 7900);
    });
    it('100% coupon: merchandise is free, shipping still applies (FREE_ABOVE sees 0)', () => {
      const t = computeTotals({ ...base, shipping: ship({ mode: 'FREE_ABOVE', freeAbove: 1 }), coupon: { code: 'ALL', type: 'PERCENT', value: 100, minOrder: 0, usageLimit: null, expiresAt: null }, lines: [line(50000)] });
      expect(t).toMatchObject({ discount: 50000, shipping: 7900, tax: 0, total: 7900 });
    });
    it('FLAT coupon larger than the cart caps at the subtotal; total never negative', () => {
      const t = computeTotals({ ...base, shipping: ship({ mode: 'FREE' }), coupon: { code: 'BIG', type: 'FLAT', value: 10_000_000, minOrder: 0, usageLimit: null, expiresAt: null }, lines: [line(1234)] });
      expect(t).toMatchObject({ discount: 1234, total: 0, tax: 0 });
    });
    it('unregistered store: tax 0 on every line', () => {
      const t = computeTotals({ ...base, gstRegistered: false, lines: [line(99900, 3, 1200)] });
      expect(t.tax).toBe(0);
      expect(t.lines[0].gstRateBp).toBe(0);
    });
    it('rejects empty carts, bad quantities and bad prices', () => {
      expect(() => computeTotals({ ...base, lines: [] })).toThrow(/empty/);
      expect(() => computeTotals({ ...base, lines: [line(100, 0)] })).toThrow(PricingError);
      expect(() => computeTotals({ ...base, lines: [line(100, 51)] })).toThrow(/between 1 and 50/);
      expect(() => computeTotals({ ...base, lines: [line(100, 1.5)] })).toThrow(PricingError);
      expect(() => computeTotals({ ...base, lines: [line(-1)] })).toThrow(PricingError);
      expect(() => computeTotals({ ...base, lines: [line(10.5)] })).toThrow(PricingError);
    });
    it('large but realistic carts are exact; carts beyond the 32-bit paise cap (₹2 crore) are refused instead of overflowing', () => {
      const t = computeTotals({ ...base, lines: Array.from({ length: 10 }, (_, i) => line(1299900, 5, 500, `k${i}`)) });
      expect(t.subtotal).toBe(10 * 5 * 1299900); // ₹6,49,950
      expect(t.tax).toBe(t.lines.reduce((n, l) => n + l.tax, 0));
      expect(() => computeTotals({ ...base, lines: Array.from({ length: 50 }, (_, i) => line(1299900, 50, 500, `k${i}`)) })).toThrow(/too large/); // ₹3.25 crore
    });
  });

  describe('GST split', () => {
    it('same state -> CGST + SGST (odd paise goes to SGST); different state -> IGST; unknown states default to intra-state', () => {
      expect(splitGst(4757, '33', '33')).toEqual({ cgst: 2378, sgst: 2379, igst: 0, interState: false });
      expect(splitGst(4757, '33', '29')).toEqual({ cgst: 0, sgst: 0, igst: 4757, interState: true });
      expect(splitGst(100, null, '29')).toEqual({ cgst: 50, sgst: 50, igst: 0, interState: false });
      expect(splitGst(0, '33', '29')).toEqual({ cgst: 0, sgst: 0, igst: 0, interState: true });
    });
  });
});
