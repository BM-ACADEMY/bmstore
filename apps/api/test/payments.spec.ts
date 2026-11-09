/** Razorpay with the tenant's own keys: order creation, signature verification, webhook signature + idempotency. */
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConsoleWhatsAppSender } from '../src/notifications/senders';
import { createApp, deleteTenants } from './helpers';
import { FakeRazorpay, startFakeRazorpay } from './razorpay-fake';
import { checkoutBody, makeStore } from './storefront-helpers';

const CREDS = { keyId: 'rzp_test_AbCdEf123456', keySecret: 'test-key-secret-0123456789' };
const WEBHOOK_SECRET = 'whsec-test-0123456789';

describe('Razorpay payments', () => {
  let app: INestApplication;
  let rzp: FakeRazorpay;
  let S: Awaited<ReturnType<typeof makeStore>>;
  let B: Awaited<ReturnType<typeof makeStore>>;
  let owner: string;

  beforeAll(async () => {
    rzp = await startFakeRazorpay(CREDS);
    process.env.RAZORPAY_API_BASE = rzp.base;
    app = await createApp();
    S = await makeStore(app);
    B = await makeStore(app);
    owner = await S.login();
    await S.api().put('/store/razorpay').set('Host', S.host).set('Authorization', `Bearer ${owner}`).send({ ...CREDS, webhookSecret: WEBHOOK_SECRET }).expect(204);
    const ownerB = await B.login();
    await B.api().put('/store/razorpay').set('Host', B.host).set('Authorization', `Bearer ${ownerB}`).send({ keyId: 'rzp_test_OtherStore0001', keySecret: 'other-store-secret-000', webhookSecret: 'other-webhook-secret' }).expect(204);
  });
  afterAll(async () => {
    await deleteTenants(app.get(PrismaService).base, [S.t.id, B.t.id]);
    await app.close();
    await rzp.close();
  });

  const place = (store = S) => store.api().post('/storefront/checkout').set('Host', store.host).send(checkoutBody([{ productId: store.plain.id, qty: 1 }], { paymentMode: 'ONLINE' }));
  const lookup = (orderNo: string, token: string, store = S) => store.api().get(`/storefront/orders/lookup?orderNo=${orderNo}&token=${token}`).set('Host', store.host);

  it('bootstrap advertises online payment only when keys are configured; the key secret never reaches the browser', async () => {
    const boot = (await S.api().get('/storefront/bootstrap').set('Host', S.host).expect(200)).body;
    expect(boot.payments.online).toBe(true);
    expect(JSON.stringify(boot)).not.toContain(CREDS.keySecret);
    const fresh = await makeStore(app);
    try {
      expect((await fresh.api().get('/storefront/bootstrap').set('Host', fresh.host).expect(200)).body.payments.online).toBe(false);
      expect((await fresh.api().post('/storefront/checkout').set('Host', fresh.host).send(checkoutBody([{ productId: fresh.plain.id, qty: 1 }], { paymentMode: 'ONLINE' })).expect(503)).body.message).toMatch(/not available/);
    } finally { await deleteTenants(app.get(PrismaService).base, [fresh.t.id]); }
  });

  it('creates the gateway order with the TENANT keys for the exact total, stock is held, nothing is paid yet', async () => {
    const r = await place().expect(201);
    expect(r.body.razorpay).toMatchObject({ keyId: CREDS.keyId, amount: r.body.total, currency: 'INR' });
    expect(JSON.stringify(r.body)).not.toContain(CREDS.keySecret);
    const call = rzp.requests.find((x) => x.method === 'POST' && x.path === '/v1/orders');
    expect(call?.auth).toBe(`Basic ${Buffer.from(`${CREDS.keyId}:${CREDS.keySecret}`).toString('base64')}`);
    const o = rzp.orders.get(r.body.razorpay.orderId);
    expect(o).toMatchObject({ amount: 99900 + 7900, receipt: r.body.orderNo }); // below the free-shipping threshold, no COD charge online
    const look = (await lookup(r.body.orderNo, r.body.token).expect(200)).body;
    expect(look).toMatchObject({ paymentStatus: 'PENDING', orderStatus: 'PENDING' });
    expect(look.razorpay.orderId).toBe(r.body.razorpay.orderId); // retry data for the confirmation page
    expect(look.expiresAt).toBeTruthy();
    const db = app.get(PrismaService).base;
    expect((await db.product.findUnique({ where: { id: S.plain.id } }))!.stock).toBe(4);
  });

  it('verify: a forged signature is refused and audited; a valid signature with matching amount marks the order PAID exactly once', async () => {
    const r = await place().expect(201);
    const { orderId } = r.body.razorpay;
    const good = rzp.pay(orderId);
    const wa = app.get(ConsoleWhatsAppSender);
    const before = wa.outbox.length;
    // tampered signature
    await S.api().post('/storefront/payments/razorpay/verify').set('Host', S.host).send({ orderNo: r.body.orderNo, ...good, razorpay_signature: good.razorpay_signature.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')) }).expect(400);
    // signature of another payment id
    await S.api().post('/storefront/payments/razorpay/verify').set('Host', S.host).send({ orderNo: r.body.orderNo, ...good, razorpay_payment_id: 'pay_forged000000' }).expect(400);
    // wrong order number for a valid signature
    await S.api().post('/storefront/payments/razorpay/verify').set('Host', S.host).send({ orderNo: 'TST-1', ...good }).expect(400);
    expect((await lookup(r.body.orderNo, r.body.token)).body.paymentStatus).toBe('PENDING');
    expect(wa.outbox.length).toBe(before);
    // the real thing
    await S.api().post('/storefront/payments/razorpay/verify').set('Host', S.host).send({ orderNo: r.body.orderNo, ...good }).expect(200);
    const look = (await lookup(r.body.orderNo, r.body.token).expect(200)).body;
    expect(look).toMatchObject({ paymentStatus: 'PAID', orderStatus: 'PENDING', expiresAt: null, razorpay: null });
    expect(look.paidAt).toBeTruthy();
    // notifications went out once (owner + customer), not again on the replay
    expect(wa.outbox.slice(before).map((m) => m.kind).sort()).toEqual(['customer.order_confirmation', 'owner.new_order']);
    await S.api().post('/storefront/payments/razorpay/verify').set('Host', S.host).send({ orderNo: r.body.orderNo, ...good }).expect(200);
    expect(wa.outbox.length).toBe(before + 2);
    const db = app.get(PrismaService).base;
    const pay = await db.payment.findFirst({ where: { providerOrderId: orderId } });
    expect(pay).toMatchObject({ status: 'PAID', providerPaymentId: good.razorpay_payment_id, verifiedVia: 'signature', method: 'upi' });
    expect(await db.auditLog.count({ where: { tenantId: S.t.id, action: 'payment.bad_signature' } })).toBeGreaterThanOrEqual(2);
  });

  it('verify: a payment whose amount does not match the order is refused even with a valid signature', async () => {
    const r = await place().expect(201);
    const short = rzp.pay(r.body.razorpay.orderId, { amount: 100 });
    expect((await S.api().post('/storefront/payments/razorpay/verify').set('Host', S.host).send({ orderNo: r.body.orderNo, ...short }).expect(400)).body.message).toMatch(/do not match/);
    expect((await lookup(r.body.orderNo, r.body.token)).body.paymentStatus).toBe('PENDING');
  });

  it('webhook: bad or missing signature -> 400; valid payment.captured marks PAID; the same event id is a no-op; other stores\' secrets do not verify', async () => {
    const r = await place().expect(201);
    const paid = rzp.pay(r.body.razorpay.orderId);
    const hook = rzp.webhook('payment.captured', paid.razorpay_payment_id, WEBHOOK_SECRET);
    const post = (body: string, sig?: string, id?: string, store = S) => {
      let q = store.api().post('/storefront/payments/razorpay/webhook').set('Host', store.host).set('Content-Type', 'application/json');
      if (sig) q = q.set('X-Razorpay-Signature', sig);
      if (id) q = q.set('X-Razorpay-Event-Id', id);
      return q.send(body);
    };
    await post(hook.body).expect(400);
    await post(hook.body, 'deadbeef'.repeat(8), hook.eventId).expect(400);
    await post(hook.body + ' ', hook.signature, hook.eventId).expect(400); // body altered after signing
    // signed with B's webhook secret, delivered to A
    const forB = rzp.webhook('payment.captured', paid.razorpay_payment_id, 'other-webhook-secret');
    await post(forB.body, forB.signature, forB.eventId).expect(400);
    // the same event delivered to B's host: B has no such payment -> accepted, ignored, nothing changes at A
    expect((await post(forB.body, forB.signature, forB.eventId, B).expect(200)).body).toEqual({ ok: true });
    expect((await lookup(r.body.orderNo, r.body.token)).body.paymentStatus).toBe('PENDING');

    const wa = app.get(ConsoleWhatsAppSender);
    const before = wa.outbox.length;
    expect((await post(hook.body, hook.signature, hook.eventId).expect(200)).body).toEqual({ ok: true });
    expect((await lookup(r.body.orderNo, r.body.token)).body.paymentStatus).toBe('PAID');
    expect(wa.outbox.length).toBe(before + 2);
    // redelivery: same event id -> duplicate, no second notification, no second audit row
    expect((await post(hook.body, hook.signature, hook.eventId).expect(200)).body).toEqual({ ok: true, duplicate: true });
    expect(wa.outbox.length).toBe(before + 2);
    const db = app.get(PrismaService).base;
    expect(await db.webhookEvent.count({ where: { tenantId: S.t.id, eventId: hook.eventId } })).toBe(1);
    expect(await db.webhookEvent.count({ where: { tenantId: B.t.id, eventId: forB.eventId } })).toBe(1);
    expect((await db.webhookEvent.findFirst({ where: { tenantId: S.t.id, eventId: hook.eventId } }))!.outcome).toBe('paid');
    // a later signature verify for the same payment is harmless
    await S.api().post('/storefront/payments/razorpay/verify').set('Host', S.host).send({ orderNo: r.body.orderNo, ...paid }).expect(200);
    expect(wa.outbox.length).toBe(before + 2);
  });

  it('webhook: payment.failed records the reason and keeps the order payable; a store without a webhook secret refuses webhooks', async () => {
    const r = await place().expect(201);
    const failedPay = rzp.pay(r.body.razorpay.orderId);
    const hook = rzp.webhook('payment.failed', failedPay.razorpay_payment_id, WEBHOOK_SECRET, { status: 'failed', error_description: 'Payment declined by bank' });
    await S.api().post('/storefront/payments/razorpay/webhook').set('Host', S.host).set('Content-Type', 'application/json').set('X-Razorpay-Signature', hook.signature).set('X-Razorpay-Event-Id', hook.eventId).send(hook.body).expect(200);
    const db = app.get(PrismaService).base;
    expect((await db.payment.findFirst({ where: { providerOrderId: r.body.razorpay.orderId } }))!.failureReason).toBe('Payment declined by bank');
    expect((await lookup(r.body.orderNo, r.body.token)).body.razorpay).not.toBeNull();
    const fresh = await makeStore(app);
    try {
      const o = await fresh.login();
      await fresh.api().put('/store/razorpay').set('Host', fresh.host).set('Authorization', `Bearer ${o}`).send(CREDS).expect(204);
      expect((await fresh.api().post('/storefront/payments/razorpay/webhook').set('Host', fresh.host).set('Content-Type', 'application/json').set('X-Razorpay-Signature', hook.signature).send(hook.body).expect(400)).body.message).toMatch(/secret is not configured/);
    } finally { await deleteTenants(db, [fresh.t.id]); }
  });

  it('the gateway rejecting the order cancels ours and puts the stock back', async () => {
    const db = app.get(PrismaService).base;
    const o = await S.login();
    // wrong keys at the store -> Razorpay answers 401 -> we answer 502 and undo the order
    await S.api().put('/store/razorpay').set('Host', S.host).set('Authorization', `Bearer ${o}`).send({ keyId: 'rzp_test_WrongKey0000001', keySecret: 'wrong-secret-wrong-secret', webhookSecret: WEBHOOK_SECRET }).expect(204);
    const stockBefore = (await db.variant.findUnique({ where: { id: S.vRed.id } }))!.stock;
    const bad = await S.api().post('/storefront/checkout').set('Host', S.host).send(checkoutBody([{ productId: S.withVariants.id, variantId: S.vRed.id, qty: 1 }], { paymentMode: 'ONLINE' }));
    expect(bad.status).toBe(502);
    expect(bad.body.message).toMatch(/refused by Razorpay/);
    expect((await db.variant.findUnique({ where: { id: S.vRed.id } }))!.stock).toBe(stockBefore);
    const cancelled = await db.order.findFirst({ where: { tenantId: S.t.id, orderStatus: 'CANCELLED' }, orderBy: { createdAt: 'desc' } });
    expect(cancelled).not.toBeNull();
    expect(await db.payment.count({ where: { orderId: cancelled!.id } })).toBe(0);
    await S.api().put('/store/razorpay').set('Host', S.host).set('Authorization', `Bearer ${o}`).send({ ...CREDS, webhookSecret: WEBHOOK_SECRET }).expect(204);
  });
});
