/** Rate limits on the public checkout surface: per IP for checkout / lookup / OTP, per phone for OTP. 429 + Retry-After. */
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { createApp, deleteTenants } from './helpers';
import { checkoutBody, makeStore } from './storefront-helpers';

describe('storefront rate limits', () => {
  let app: INestApplication;
  let S: Awaited<ReturnType<typeof makeStore>>;
  const saved = { ...process.env };
  beforeAll(async () => {
    process.env.CHECKOUT_IP_LIMIT = '3';
    process.env.LOOKUP_IP_LIMIT = '2';
    process.env.OTP_IP_LIMIT = '4';
    process.env.OTP_PHONE_LIMIT = '2';
    app = await createApp();
    S = await makeStore(app);
    const r = app.get(RedisService).client;
    const keys = await r.keys('rl:checkout:*'); keys.push(...(await r.keys('rl:lookup:*')), ...(await r.keys('rl:otp:*')), ...(await r.keys('rl:verify:*')));
    if (keys.length) await r.del(...keys);
    await app.get(PrismaService).base.product.update({ where: { id: S.plain.id }, data: { stock: 100 } });
  });
  afterAll(async () => {
    await deleteTenants(app.get(PrismaService).base, [S.t.id]);
    await app.close();
    for (const k of ['CHECKOUT_IP_LIMIT', 'LOOKUP_IP_LIMIT', 'OTP_IP_LIMIT', 'OTP_PHONE_LIMIT']) process.env[k] = saved[k];
  });

  it('checkout: the 4th attempt from one IP inside the window is refused with Retry-After, and places no order', async () => {
    const before = await app.get(PrismaService).base.order.count({ where: { tenantId: S.t.id } });
    for (let i = 0; i < 3; i++) await S.api().post('/storefront/checkout').set('Host', S.host).send(checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: `987650010${i}` })).expect(201);
    const r = await S.api().post('/storefront/checkout').set('Host', S.host).send(checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '9876500109' })).expect(429);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(r.body.message).toMatch(/Too many/);
    expect(await app.get(PrismaService).base.order.count({ where: { tenantId: S.t.id } })).toBe(before + 3);
    // quotes are not limited (they are read-only and the form re-quotes while typing)
    await S.api().post('/storefront/quote').set('Host', S.host).send({ items: [{ productId: S.plain.id, qty: 1 }] }).expect(200);
  });

  it('order lookup: per IP', async () => {
    const get = () => S.api().get('/storefront/orders/lookup?orderNo=NOPE-1&phone=9876500001').set('Host', S.host);
    await get().expect(404);
    await get().expect(404);
    await get().expect(429);
  });

  it('OTP: per phone (2) then per IP (4); the limit applies to the same phone on the same store, another phone still works until the IP cap', async () => {
    const send = (phone: string) => S.api().post('/storefront/otp/send').set('Host', S.host).send({ phone });
    await send('9876500201').expect(200);
    await send('9876500201').expect(200);
    await send('9876500201').expect(429);
    await send('9876500202').expect(200); // 4th IP hit overall (3 sends + 1 refused... the refused one counted too) -> still within 4
    await send('9876500203').expect(429); // IP cap
  });
});
