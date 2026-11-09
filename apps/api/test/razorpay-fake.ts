/**
 * In-process Razorpay double for tests and local development. Implements the slice of the REST API the platform
 * uses (POST /v1/orders, GET /v1/payments/:id) with HTTP basic auth checked against the keys it is started with,
 * plus a test-only helper POST /__test/pay/:orderId that "captures" a payment and returns the callback signature
 * exactly as Checkout.js would hand it to the browser, and a helper that builds signed webhook bodies.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { createServer, Server } from 'node:http';

export interface FakeRazorpay {
  port: number; base: string; orders: Map<string, any>; payments: Map<string, any>; requests: Array<{ method: string; path: string; auth: string | null }>;
  /** Simulate the shopper paying: returns what Checkout.js would post back. */
  pay(orderId: string, opts?: { amount?: number; method?: string }): { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
  /** A webhook delivery (body + signature header) for a payment, signed with `webhookSecret`. */
  webhook(event: string, paymentId: string, webhookSecret: string, over?: Record<string, unknown>): { body: string; signature: string; eventId: string };
  close(): Promise<void>;
}

export function startFakeRazorpay(creds: { keyId: string; keySecret: string }, port = 0): Promise<FakeRazorpay> {
  const orders = new Map<string, any>();
  const payments = new Map<string, any>();
  const requests: FakeRazorpay['requests'] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const auth = req.headers.authorization ?? null;
      requests.push({ method: req.method ?? '', path: url.pathname, auth });
      const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (url.pathname.startsWith('/__test/pay/')) {
        const id = url.pathname.split('/').pop()!;
        const o = orders.get(id);
        if (!o) return json(404, { error: 'no such order' });
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
        const pid = `pay_${randomBytes(7).toString('hex')}`;
        payments.set(pid, { id: pid, entity: 'payment', order_id: id, amount: body.amount ?? o.amount, currency: o.currency, status: 'captured', method: body.method ?? 'upi', captured: true, email: 'x@example.com', contact: '+919876543210', created_at: Math.floor(Date.now() / 1000) });
        o.status = 'paid';
        return json(200, { razorpay_order_id: id, razorpay_payment_id: pid, razorpay_signature: createHmac('sha256', creds.keySecret).update(`${id}|${pid}`).digest('hex') });
      }
      const expected = `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64')}`;
      if (auth !== expected) return json(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } });
      if (req.method === 'POST' && url.pathname === '/v1/orders') {
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        if (!Number.isInteger(body.amount) || body.amount < 100) return json(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'amount must be at least INR 1.00' } });
        const id = `order_${randomBytes(7).toString('hex')}`;
        const o = { id, entity: 'order', amount: body.amount, amount_paid: 0, amount_due: body.amount, currency: body.currency ?? 'INR', receipt: body.receipt ?? null, status: 'created', notes: body.notes ?? {}, created_at: Math.floor(Date.now() / 1000) };
        orders.set(id, o);
        return json(200, o);
      }
      const m = /^\/v1\/payments\/([^/]+)$/.exec(url.pathname);
      if (req.method === 'GET' && m) {
        const p = payments.get(decodeURIComponent(m[1]));
        return p ? json(200, p) : json(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } });
      }
      json(404, { error: { code: 'NOT_FOUND' } });
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const p = (server.address() as any).port as number;
      const base = `http://127.0.0.1:${p}`;
      resolve({
        port: p, base, orders, payments, requests,
        pay(orderId, opts = {}) {
          const o = orders.get(orderId);
          if (!o) throw new Error('no such order');
          const pid = `pay_${randomBytes(7).toString('hex')}`;
          payments.set(pid, { id: pid, entity: 'payment', order_id: orderId, amount: opts.amount ?? o.amount, currency: o.currency, status: 'captured', method: opts.method ?? 'upi', captured: true });
          o.status = 'paid';
          return { razorpay_order_id: orderId, razorpay_payment_id: pid, razorpay_signature: createHmac('sha256', creds.keySecret).update(`${orderId}|${pid}`).digest('hex') };
        },
        webhook(event, paymentId, webhookSecret, over = {}) {
          const p = payments.get(paymentId);
          if (!p) throw new Error('no such payment');
          const eventId = `evt_${randomBytes(7).toString('hex')}`;
          const body = JSON.stringify({ entity: 'event', account_id: 'acc_test', event, contains: ['payment'], payload: { payment: { entity: { ...p, ...over } } }, created_at: Math.floor(Date.now() / 1000) });
          return { body, signature: createHmac('sha256', webhookSecret).update(body).digest('hex'), eventId };
        },
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

/** Standalone for local development:  npx ts-node test/razorpay-fake.ts  (RAZORPAY_API_BASE=http://127.0.0.1:9200) */
if (require.main === module) {
  const keyId = process.env.FAKE_RZP_KEY_ID ?? 'rzp_test_FAKE0000000001';
  const keySecret = process.env.FAKE_RZP_KEY_SECRET ?? 'fake-secret-fake-secret';
  startFakeRazorpay({ keyId, keySecret }, Number(process.env.FAKE_RZP_PORT ?? 9200)).then((f) => console.log(`fake Razorpay on ${f.base}  (keyId=${keyId}; POST ${f.base}/__test/pay/<order_id> to simulate a payment)`));
}
