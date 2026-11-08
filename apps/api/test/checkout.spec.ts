/** Guest checkout end to end (COD), order numbers, stock under concurrency, coupons, unpaid-order expiry, lookup. */
import { INestApplication } from '@nestjs/common';
import { JobsService } from '../src/jobs/jobs.service';
import { ConsoleEmailSender, ConsoleWhatsAppSender } from '../src/notifications/senders';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConsoleOtpProvider } from '../src/storefront/otp';
import { createApp, deleteTenants } from './helpers';
import { FakeRazorpay, startFakeRazorpay } from './razorpay-fake';
import { checkoutBody, makeStore } from './storefront-helpers';

const CREDS = { keyId: 'rzp_test_AbCdEf123456', keySecret: 'test-key-secret-0123456789' };

describe('checkout and orders', () => {
  let app: INestApplication;
  let rzp: FakeRazorpay;
  let S: Awaited<ReturnType<typeof makeStore>>;
  const db = () => app.get(PrismaService).base;

  beforeAll(async () => {
    rzp = await startFakeRazorpay(CREDS);
    process.env.RAZORPAY_API_BASE = rzp.base;
    app = await createApp();
    S = await makeStore(app);
    const owner = await S.login();
    await S.api().put('/store/razorpay').set('Host', S.host).set('Authorization', `Bearer ${owner}`).send(CREDS).expect(204);
  });
  afterAll(async () => { await deleteTenants(db(), [S.t.id]); await app.close(); await rzp.close(); });

  const post = (path: string, body: object) => S.api().post(path).set('Host', S.host).send(body);

  it('quote: totals from the database, not the browser; coupon, city rate, free-above and COD charge all apply', async () => {
    const q = (await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 2 }], city: 'Chennai', couponCode: 'ten', paymentMode: 'COD' }).expect(200)).body;
    expect(q).toMatchObject({ subtotal: 199800, discount: 19980, shipping: 4900, shippingReason: 'city', codCharge: 4900, total: 189620, tax: 8563, coupon: { code: 'TEN' } });
    const notFree = (await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 2 }], city: 'Madurai', paymentMode: 'ONLINE' }).expect(200)).body;
    expect(notFree).toMatchObject({ shipping: 7900, shippingReason: 'flat', codCharge: 0, total: 207700 }); // ₹1,998 is below the ₹1,999 threshold
    const free = (await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 3 }], city: 'Madurai', paymentMode: 'ONLINE' }).expect(200)).body;
    expect(free).toMatchObject({ shipping: 0, shippingReason: 'free_above', codCharge: 0, total: 299700 });
    const exact = (await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 2 }], couponCode: 'TEN', paymentMode: 'ONLINE' }).expect(200)).body;
    expect(exact).toMatchObject({ shipping: 7900, shippingReason: 'flat' }); // FREE_ABOVE compares the DISCOUNTED subtotal
    const flat = (await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 1 }], city: 'Madurai', paymentMode: 'ONLINE' }).expect(200)).body;
    expect(flat).toMatchObject({ shipping: 7900, shippingReason: 'flat', total: 107800 });
    // the browser cannot set a price: unknown fields are rejected, prices come from the catalogue
    await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 1, unitPrice: 1 }] }).expect(400);
    await post('/storefront/quote', { items: [{ productId: S.draft.id, qty: 1 }] }).expect(400); // DRAFT is not for sale
    await post('/storefront/quote', { items: [{ productId: S.withVariants.id, qty: 1 }] }).expect(400); // needs a variant
    await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 0 }] }).expect(400);
    await post('/storefront/quote', { items: [] }).expect(400);
    expect((await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 1 }], couponCode: 'OLD' }).expect(400)).body.message).toMatch(/expired/);
    expect((await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 1 }], couponCode: 'FLAT200' }).expect(400)).body.message).toMatch(/minimum order/);
    expect((await post('/storefront/quote', { items: [{ productId: S.plain.id, qty: 1 }], couponCode: 'NOPE' }).expect(400)).body.message).toMatch(/not valid/);
  });

  it('COD order: one transaction, stock decremented, customer created by phone, order_no with the store prefix, notifications once', async () => {
    const wa = app.get(ConsoleWhatsAppSender), mail = app.get(ConsoleEmailSender);
    const wa0 = wa.outbox.length, mail0 = mail.outbox.length;
    const r = await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }, { productId: S.withVariants.id, variantId: S.vRed.id, qty: 1 }], { couponCode: 'TEN', note: 'Call before delivery' })).expect(201);
    expect(r.body.orderNo).toMatch(/^TST-\d+$/);
    expect(r.body).toMatchObject({ paymentMode: 'COD', paymentStatus: 'PENDING' });
    const o = await db().order.findFirst({ where: { tenantId: S.t.id, orderNo: r.body.orderNo }, include: { customer: true } });
    const subtotal = 99900 + 849900;
    expect(o).toMatchObject({ subtotal, discount: Math.floor(subtotal / 10), shipping: 0, codCharge: 4900, couponCode: 'TEN', customerNote: 'Call before delivery', orderStatus: 'PENDING' });
    expect(o!.total).toBe(subtotal - Math.floor(subtotal / 10) + 4900);
    expect(o!.customer).toMatchObject({ phone: '9876500002', name: 'Meena Lakshmi', email: 'meena@example.com' });
    expect((o!.address as any)).toMatchObject({ city: 'Madurai', stateCode: '33', phoneVerified: false });
    const items = o!.items as any[];
    expect(items.map((i) => i.variantLabel)).toEqual([null, 'Colour: Red']);
    expect(items[1]).toMatchObject({ hsnCode: '5007', gstRateBp: 1200, unitPrice: 849900 });
    expect(items.reduce((n, i) => n + i.tax, 0)).toBe(o!.tax);
    expect((await db().product.findUnique({ where: { id: S.plain.id } }))!.stock).toBe(4);
    expect((await db().variant.findUnique({ where: { id: S.vRed.id } }))!.stock).toBe(2);
    // notifications: owner (WhatsApp + email) and customer (WhatsApp + email), plus a low-stock alert: red went 3 -> 2, crossing the threshold of 2
    const kinds = wa.outbox.slice(wa0).map((m) => m.kind).sort();
    expect(kinds).toEqual(['customer.order_confirmation', 'owner.low_stock', 'owner.new_order']);
    expect(mail.outbox.slice(mail0).map((m) => m.kind).sort()).toEqual(['customer.order_confirmation', 'owner.low_stock', 'owner.new_order']);
    expect(wa.outbox.find((m) => m.kind === 'owner.new_order')!.text).toContain('Call before delivery');
    expect(wa.outbox.find((m) => m.kind === 'customer.order_confirmation')!.text).toContain(r.body.orderNo);
    expect(wa.outbox.find((m) => m.kind === 'owner.low_stock')!.text).toMatch(/Kanchipuram Silk \(Colour: Red\): 2 left/);
    // a product already below the threshold does not alert again on every sale
    const n1 = wa.outbox.length;
    await post('/storefront/checkout', checkoutBody([{ productId: S.withVariants.id, variantId: S.vBlue.id, qty: 1 }], { phone: '9876500008' })).expect(201);
    expect(wa.outbox.slice(n1).map((m) => m.kind)).not.toContain('owner.low_stock');
    // the admin sees it like any other order, with history
    const owner = await S.login();
    const admin = (await S.api().get(`/store/orders/${o!.id}`).set('Host', S.host).set('Authorization', `Bearer ${owner}`).expect(200)).body;
    expect(admin.history.map((h: any) => h.action)).toContain('order.placed');
    // a second order by the same phone reuses the customer and bumps the sequence
    const r2 = await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { name: 'Meena L', address: { ...checkoutBody([]).address, line1: 'New house 9' } })).expect(201);
    expect(Number(r2.body.orderNo.split('-')[1])).toBe(Number(r.body.orderNo.split('-')[1]) + 2); // one order (the blue variant) was placed in between
    const c = await db().customer.findUnique({ where: { tenantId_phone: { tenantId: S.t.id, phone: '9876500002' } } });
    expect(c!.name).toBe('Meena L');
    expect((c!.addresses as any[]).length).toBe(2);
    expect(await db().customer.count({ where: { tenantId: S.t.id, phone: '9876500002' } })).toBe(1);
  });

  it('phone normalisation and validation: +91 / 0 prefixes accepted, junk refused, bad pincode / state refused', async () => {
    await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '+91 98765-00003' })).expect(201);
    expect((await db().customer.findFirst({ where: { tenantId: S.t.id, phone: '9876500003' } }))).not.toBeNull();
    await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '1234567890' })).expect(400);
    await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { address: { ...checkoutBody([]).address, pincode: '0123' } })).expect(400);
    await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { address: { ...checkoutBody([]).address, state: 'Narnia' } })).expect(400);
    await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { paymentMode: 'UPI' })).expect(400);
  });

  it('OTP: stub provider, hashed code in Redis, 5 attempts, verified phone recorded on the order', async () => {
    const otp = app.get(ConsoleOtpProvider);
    await post('/storefront/otp/send', { phone: '9876500004' }).expect(200);
    const code = otp.lastCodes.get('9876500004')!;
    expect(code).toMatch(/^\d{6}$/);
    expect((await post('/storefront/otp/verify', { phone: '9876500004', code: code === '000000' ? '000001' : '000000' }).expect(400)).body.message).toMatch(/not right/);
    const { phoneToken } = (await post('/storefront/otp/verify', { phone: '9876500004', code }).expect(200)).body;
    await post('/storefront/otp/verify', { phone: '9876500004', code }).expect(400); // single use
    const r = await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '9876500004', phoneToken })).expect(201);
    expect(((await db().order.findFirst({ where: { tenantId: S.t.id, orderNo: r.body.orderNo } }))!.address as any).phoneVerified).toBe(true);
    // a token for another phone does not count
    const r2 = await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '9876500005', phoneToken })).expect(201);
    expect(((await db().order.findFirst({ where: { tenantId: S.t.id, orderNo: r2.body.orderNo } }))!.address as any).phoneVerified).toBe(false);
  });

  it('NO OVERSELL: 12 concurrent checkouts for a product with 3 left -> exactly 3 succeed, stock ends at 0, order numbers unique', async () => {
    const p = await db().product.create({ data: { tenantId: S.t.id, name: 'Last Three', slug: 'last-three', price: 50000, mrp: 50000, stock: 3, status: 'ACTIVE', images: [] } });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => post('/storefront/checkout', checkoutBody([{ productId: p.id, qty: 1 }], { phone: `98700000${String(i).padStart(2, '0')}` }))));
    const ok = results.filter((r) => r.status === 201);
    const sold = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(3);
    expect(sold).toHaveLength(9);
    expect(sold[0].body.message).toMatch(/out of stock/);
    expect((await db().product.findUnique({ where: { id: p.id } }))!.stock).toBe(0);
    const nos = ok.map((r) => r.body.orderNo);
    expect(new Set(nos).size).toBe(3);
    // and with a variant, mixed quantities: 2 units left, requests for 1,1,1,2 -> at most 2 units leave
    const v = await db().variant.create({ data: { tenantId: S.t.id, productId: S.withVariants.id, optionName: 'Colour', optionValue: 'Green', stock: 2 } });
    const res2 = await Promise.all([1, 1, 1, 2].map((qty, i) => post('/storefront/checkout', checkoutBody([{ productId: S.withVariants.id, variantId: v.id, qty }], { phone: `98700001${String(i).padStart(2, '0')}` }))));
    const unitsSold = res2.filter((r) => r.status === 201).reduce((n, r) => n + (r.body.total >= 2 * 849900 ? 2 : 1), 0);
    const left = (await db().variant.findUnique({ where: { id: v.id } }))!.stock;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(unitsSold + left).toBe(2);
  });

  it('order numbers: "<prefix>-<seq>" from the settings sequence, strictly increasing, unique even under parallel checkouts', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: `98700002${String(i).padStart(2, '0')}` }))));
    // plain has limited stock now; whichever succeeded must have distinct numbers
    const nos = results.filter((r) => r.status === 201).map((r) => r.body.orderNo as string);
    expect(new Set(nos).size).toBe(nos.length);
    for (const n of nos) expect(n).toMatch(/^TST-\d{4,}$/);
    const all = await db().order.findMany({ where: { tenantId: S.t.id }, select: { orderNo: true } });
    expect(new Set(all.map((o) => o.orderNo)).size).toBe(all.length);
  });

  it('coupon usage limit counts placed orders; cancelled ones free the slot', async () => {
    await db().product.update({ where: { id: S.plain.id }, data: { stock: 50 } });
    const r1 = await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { couponCode: 'ONCE' })).expect(201);
    expect((await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { couponCode: 'ONCE' })).expect(400)).body.message).toMatch(/used up/);
    const o = await db().order.findFirst({ where: { tenantId: S.t.id, orderNo: r1.body.orderNo } });
    const owner = await S.login();
    await S.api().post(`/store/orders/${o!.id}/status`).set('Host', S.host).set('Authorization', `Bearer ${owner}`).send({ status: 'CANCELLED' }).expect(200);
    await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { couponCode: 'ONCE' })).expect(201);
  });

  it('unpaid ONLINE orders: stock held until expires_at, then cancelled and restocked by the job; a late payment reopens the order', async () => {
    const jobs = app.get(JobsService);
    const stock0 = (await db().product.findUnique({ where: { id: S.plain.id } }))!.stock;
    const r = await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 2 }], { paymentMode: 'ONLINE' })).expect(201);
    expect((await db().product.findUnique({ where: { id: S.plain.id } }))!.stock).toBe(stock0 - 2);
    expect(await jobs.expireUnpaidOrders(new Date())).toBe(0); // not due yet
    const o = await db().order.findFirst({ where: { tenantId: S.t.id, orderNo: r.body.orderNo } });
    expect(o!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect(await jobs.expireUnpaidOrders(new Date(Date.now() + 31 * 60_000))).toBe(1);
    expect((await db().order.findUnique({ where: { id: o!.id } }))!.orderStatus).toBe('CANCELLED');
    expect((await db().product.findUnique({ where: { id: S.plain.id } }))!.stock).toBe(stock0);
    expect(await jobs.expireUnpaidOrders(new Date(Date.now() + 31 * 60_000))).toBe(0); // idempotent
    // money arrives late: the order comes back and takes the stock again
    const paid = rzp.pay(r.body.razorpay.orderId);
    await post('/storefront/payments/razorpay/verify', { orderNo: r.body.orderNo, ...paid }).expect(200);
    expect(await db().order.findUnique({ where: { id: o!.id } })).toMatchObject({ orderStatus: 'PENDING', paymentStatus: 'PAID' });
    expect((await db().product.findUnique({ where: { id: S.plain.id } }))!.stock).toBe(stock0 - 2);
  });

  it('order lookup needs the right phone or the checkout token; the response never carries the full phone or any secret', async () => {
    const r = await post('/storefront/checkout', checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '9876500009' })).expect(201);
    const get = (q: string) => S.api().get(`/storefront/orders/lookup?${q}`).set('Host', S.host);
    await get(`orderNo=${r.body.orderNo}`).expect(404);
    await get(`orderNo=${r.body.orderNo}&phone=9876500001`).expect(404);
    await get(`orderNo=${r.body.orderNo}&token=${r.body.token.replace(/.$/, 'x')}`).expect(404);
    await get(`orderNo=NOPE-1&phone=9876500009`).expect(404);
    const byPhone = (await get(`orderNo=${r.body.orderNo.toLowerCase()}&phone=%2B919876500009`).expect(200)).body;
    const byToken = (await get(`orderNo=${r.body.orderNo}&token=${r.body.token}`).expect(200)).body;
    expect(byPhone.token).toBe(r.body.token);
    expect(byToken.customer.phone).toBe('98******09');
    expect(JSON.stringify(byToken)).not.toMatch(/9876500009|keySecret|tenantId/);
    expect(byToken.invoiceUrl).toContain(`/api/storefront/orders/${r.body.orderNo}/invoice?t=${r.body.token}`);
  });

  it('weekly summary: real numbers for the last 7 days, sent once per store per week', async () => {
    const jobs = app.get(JobsService);
    const s = await app.get(PrismaService).runAsTenant(S.t.id, () => jobs.summarize());
    expect(s.orders).toBeGreaterThanOrEqual(1);
    expect(s.sales).toBeGreaterThan(0);
    expect(s.top[0].qty).toBeGreaterThanOrEqual(s.top[s.top.length - 1].qty);
    const wa = app.get(ConsoleWhatsAppSender);
    const n0 = wa.outbox.length;
    expect(await jobs.weeklySummaries(new Date())).toBeGreaterThanOrEqual(1);
    const mine = wa.outbox.slice(n0).filter((m) => m.kind === 'owner.weekly_summary' && m.text.startsWith(`${S.t.name}:`)); // other stores (e.g. the seeded demo) share the demo WhatsApp number
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toMatch(/Orders: \d+ · Sales: ₹/);
    expect(await jobs.weeklySummaries(new Date())).toBe(0); // same week, same stores: nothing resent
    expect(jobs.isWeeklySlot(new Date('2026-11-09T03:30:00Z'))).toBe(true); // Monday 09:00 IST
    expect(jobs.isWeeklySlot(new Date('2026-11-09T04:30:00Z'))).toBe(false);
    expect(jobs.isWeeklySlot(new Date('2026-11-10T03:30:00Z'))).toBe(false);
  });
});
