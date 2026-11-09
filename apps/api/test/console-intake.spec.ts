import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { deriveIntakeKey, missingFields, normalizeIntake } from '../src/console/intake';
import { themeFor } from '../src/console/layouts';
import { createApp, deleteTenants, uniq } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

const fullIntake = (over: Record<string, unknown> = {}) => {
  const k = uniq('ik');
  return {
    intakeKey: k,
    businessName: `Kaveri Silks ${k}`,
    ownerName: 'Lakshmi R',
    whatsapp: '+91 98000 00001',
    email: `owner-${k}@intake.test`,
    category: 'Sarees',
    logoUrl: 'https://drive.example/logo.png',
    brandColors: ['#7c2d12', '#b45309'],
    productSheet: 'kaveri-products.xlsx',
    gstNumber: '33abcde1234f1z5',
    address: '12 Car Street, Madurai 625001',
    domain: 'shop.kaveri-silks.in',
    razorpayStatus: 'kyc_pending',
    shipping: { mode: 'FREE_ABOVE', flatRatePaise: 6000, freeAbovePaise: 99900, notes: 'Ships from Madurai within 2 days' },
    cod: { enabled: true, chargePaise: 5000 },
    aboutText: 'Handloom silk sarees from Madurai since 1998.',
    ...over,
  };
};

describe('intake normalisation (pure)', () => {
  it('accepts the JSON shape and the flat form shape alike', () => {
    const j = normalizeIntake(fullIntake({ intakeKey: 'same' }));
    const f = normalizeIntake({
      intakeKey: 'same', businessName: j.businessName, ownerName: 'Lakshmi R', whatsapp: '9800000001', email: j.email, category: 'Sarees', logo: 'x',
      brandColors: '#7c2d12, b45309', productSheet: 'p.xlsx', address: 'a', razorpayStatus: 'KYC pending', shippingMode: 'free_above',
      shippingFlatRatePaise: '6000', shippingFreeAbovePaise: '99900', codEnabled: 'on', codChargePaise: '5000', about: 'x',
    });
    expect(f.brandColors).toEqual(['#7C2D12', '#B45309']);
    expect(f.shipping).toEqual({ mode: 'FREE_ABOVE', flatRatePaise: 6000, freeAbovePaise: 99900, notes: null });
    expect(f.codEnabled).toBe(true);
    expect(f.razorpayStatus).toBe('kyc_pending');
    expect(j.gstNumber).toBe('33ABCDE1234F1Z5');
    expect(j.whatsapp).toBe('+919800000001');
    expect(j.layout).toBe('boutique'); // from category
    expect(missingFields(j)).toEqual([]);
  });
  it('lists every problem at once, money must be whole paise', () => {
    let err: any;
    try { normalizeIntake({ businessName: '', email: 'nope', brandColors: 'red', shipping: { mode: 'FLAT', flatRatePaise: 60.5 }, layout: 'neon' }); } catch (e) { err = e; }
    const msgs: string[] = err.getResponse().message;
    expect(msgs).toEqual(expect.arrayContaining(['Business name is required', 'Email is not valid', 'Brand colours must be hex like #7C2D12', 'Flat shipping rate must be a whole number of paise']));
    expect(msgs.some((m) => m.startsWith('Layout must be one of'))).toBe(true);
  });
  it('missing fields: Razorpay must be started unless COD only', () => {
    const n = normalizeIntake({ businessName: 'Tiny', razorpayStatus: 'not_started' });
    expect(missingFields(n)).toEqual(expect.arrayContaining(['Owner name', 'Logo', 'Product sheet', 'Razorpay status (started KYC, active, or COD only)']));
    expect(missingFields({ ...normalizeIntake(fullIntake()), razorpayStatus: 'not_needed' })).toEqual([]);
  });
  it('derived key: same business + email => same key', () => {
    expect(deriveIntakeKey('Kaveri Silks', 'A@b.in')).toBe(deriveIntakeKey('kaveri  silks', 'a@b.in'));
    expect(deriveIntakeKey('Kaveri Silks', 'a@b.in')).not.toBe(deriveIntakeKey('Kaveri Silk', 'a@b.in'));
  });
  it('theme defaults per layout, brand colours win', () => {
    expect(themeFor('grocery')).toMatchObject({ layoutVariant: 'grocery', cardStyle: 'compact', primaryColor: '#166534' });
    expect(themeFor('grocery', ['#abcdef'])).toMatchObject({ primaryColor: '#ABCDEF', secondaryColor: '#CA8A04' });
    expect(JSON.stringify(themeFor('boutique'))).not.toMatch(/review|rating|testimonial/i);
  });
});

describe('create store from intake (console API)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const ids: string[] = [];
  const track = (r: any) => { if (r?.store?.id && !ids.includes(r.store.id)) ids.push(r.store.id); return r; };

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    s = await superadminSession(app);
  });
  afterAll(async () => {
    await deleteTenants(prisma.base, ids);
    await cleanupSuperadmin(app, s.id);
    await app.close();
  });

  it('creates tenant (BUILDING), theme for the layout, settings, 4 policy pages, about page and one owner login', async () => {
    const body = fullIntake();
    const r = track((await s.call('post', '/superadmin/console/intake').send(body).expect(200)).body);
    expect(r.created).toBe(true);
    expect(r.store.status).toBe('BUILDING');
    expect(r.store.url).toBe(`http://${r.store.subdomain}.localhost:3002`);
    expect(r.intake).toMatchObject({ complete: true, missing: [] });
    expect(r.ownerLogin.email).toBe(body.email);
    expect(r.ownerLogin.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(r.policies.map((p: any) => p.action)).toEqual(['created', 'created', 'created', 'created']);

    const tid = r.store.id;
    const [t, settings, theme, pages, users, intake] = await Promise.all([
      prisma.base.tenant.findUniqueOrThrow({ where: { id: tid } }),
      prisma.base.settings.findUniqueOrThrow({ where: { tenantId: tid } }),
      prisma.base.themeConfig.findUniqueOrThrow({ where: { tenantId: tid } }),
      prisma.base.page.findMany({ where: { tenantId: tid } }),
      prisma.base.user.findMany({ where: { tenantId: tid } }),
      prisma.base.storeIntake.findUniqueOrThrow({ where: { tenantId: tid } }),
    ]);
    expect(t).toMatchObject({ status: 'BUILDING', plan: 'STANDARD', gstNumber: '33ABCDE1234F1Z5', whatsappNumber: '+919800000001', customDomain: null });
    expect(settings).toMatchObject({ shippingMode: 'FREE_ABOVE', flatRate: 6000, freeAbove: 99900, codEnabled: true, codCharge: 5000 });
    expect(theme).toMatchObject({ layoutVariant: 'boutique', primaryColor: '#7C2D12', secondaryColor: '#B45309' });
    expect(pages.filter((p) => p.isPolicy)).toHaveLength(4);
    expect(pages.find((p) => p.slug === 'shipping-policy')!.content).toContain('Ships from Madurai within 2 days');
    expect(pages.find((p) => p.slug === 'about')!.content).toContain('since 1998');
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ role: 'store_owner', email: body.email });
    expect(intake.completedAt).not.toBeNull();

    // the temporary password really logs in, on the store host only
    await request(app.getHttpServer()).post('/auth/login').set('Host', `${r.store.subdomain}.localhost`).send({ email: body.email, password: r.ownerLogin.temporaryPassword }).expect(200);
    // BUILDING store is a preview
    const h = await request(app.getHttpServer()).get('/health').set('Host', `${r.store.subdomain}.localhost`).expect(200);
    expect(h.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('IDEMPOTENT: the same intake again returns the same store, no second owner, no duplicate pages, password not re-issued', async () => {
    const body = fullIntake();
    const a = track((await s.call('post', '/superadmin/console/intake').send(body).expect(200)).body);
    const b = (await s.call('post', '/superadmin/console/intake').send(body).expect(200)).body;
    expect(b.created).toBe(false);
    expect(b.store.id).toBe(a.store.id);
    expect(b.ownerLogin).toMatchObject({ email: body.email, temporaryPassword: null });
    expect(b.policies.map((p: any) => p.action)).toEqual(['kept', 'kept', 'kept', 'kept']);
    expect(await prisma.base.tenant.count({ where: { name: body.businessName } })).toBe(1);
    expect(await prisma.base.user.count({ where: { tenantId: a.store.id } })).toBe(1);
    expect(await prisma.base.page.count({ where: { tenantId: a.store.id } })).toBe(5);
  });

  it('IDEMPOTENT without a key: same business + email (form posted twice) => one store', async () => {
    const { intakeKey, ...body } = fullIntake();
    const a = track((await s.call('post', '/superadmin/console/intake').send(body).expect(200)).body);
    const b = (await s.call('post', '/superadmin/console/intake').type('form').send({ ...body, brandColors: body.brandColors.join(','), shipping: undefined, cod: undefined, shippingMode: 'FLAT', codEnabled: 'yes' }).expect(200)).body;
    expect(b.store.id).toBe(a.store.id);
    expect(b.created).toBe(false);
  });

  it('IDEMPOTENT under concurrency: five identical submissions at once create exactly one store', async () => {
    const body = fullIntake();
    const rs = await Promise.all(Array.from({ length: 5 }, () => s.call('post', '/superadmin/console/intake').send(body)));
    for (const r of rs) expect(r.status).toBe(200);
    const storeIds = new Set(rs.map((r) => track(r.body).store.id));
    expect(storeIds.size).toBe(1);
    expect(rs.filter((r) => r.body.created)).toHaveLength(1);
    expect(rs.filter((r) => r.body.ownerLogin?.temporaryPassword)).toHaveLength(1);
    const tid = [...storeIds][0];
    expect(await prisma.base.user.count({ where: { tenantId: tid } })).toBe(1);
    expect(await prisma.base.page.count({ where: { tenantId: tid, isPolicy: true } })).toBe(4);
  });

  it('partial intake: store is created, intake stays incomplete; filling the rest later completes it once and never overwrites store config', async () => {
    const k = uniq('part');
    const r = track((await s.call('post', '/superadmin/console/intake').send({ intakeKey: k, businessName: `Part ${k}`, whatsapp: '9800000009', layout: 'grocery' }).expect(200)).body);
    expect(r.intake.complete).toBe(false);
    expect(r.intake.missing).toEqual(expect.arrayContaining(['Email', 'Logo', 'Product sheet']));
    expect(r.ownerLogin).toBeNull(); // no email yet
    expect((await prisma.base.themeConfig.findUniqueOrThrow({ where: { tenantId: r.store.id } })).layoutVariant).toBe('grocery');

    // developer tweaks the theme; the later intake must not undo it
    await prisma.base.themeConfig.update({ where: { tenantId: r.store.id }, data: { primaryColor: '#000000' } });
    const full = fullIntake({ intakeKey: k, businessName: `Part ${k}`, layout: 'grocery' });
    const r2 = (await s.call('patch', `/superadmin/console/stores/${r.store.id}/intake`).send(full).expect(200)).body;
    expect(r2.intake.complete).toBe(true);
    expect(r2.ownerLogin.temporaryPassword).toBeTruthy(); // owner created now that the email exists
    expect((await prisma.base.themeConfig.findUniqueOrThrow({ where: { tenantId: r.store.id } })).primaryColor).toBe('#000000');
    const completedAt = (await prisma.base.storeIntake.findUniqueOrThrow({ where: { tenantId: r.store.id } })).completedAt;
    const r3 = (await s.call('patch', `/superadmin/console/stores/${r.store.id}/intake`).send({ aboutText: 'changed' }).expect(200)).body;
    expect(r3.intake.completedAt).toBe(completedAt!.toISOString()); // the delivery clock never restarts
  });

  it('subdomain clash gets a suffix; explicit taken subdomain is a 409; reserved is refused; bad input is a 400', async () => {
    const name = `Clash ${uniq()}`;
    const a = track((await s.call('post', '/superadmin/console/intake').send({ businessName: name, email: `a-${uniq()}@x.test` }).expect(200)).body);
    const b = track((await s.call('post', '/superadmin/console/intake').send({ businessName: name, email: `b-${uniq()}@x.test` }).expect(200)).body);
    expect(b.store.subdomain).toBe(`${a.store.subdomain}-2`);
    await s.call('post', '/superadmin/console/intake').send({ businessName: 'Other', email: `c-${uniq()}@x.test`, subdomain: a.store.subdomain }).expect(409);
    await s.call('post', '/superadmin/console/intake').send({ businessName: 'Other', subdomain: 'console' }).expect(400);
    await s.call('post', '/superadmin/console/intake').send({ businessName: 'x', shipping: { mode: 'FLAT', flatRatePaise: 1.5 } }).expect(400);
  });

  it('store owners and anonymous callers cannot use it', async () => {
    const body = fullIntake();
    const r = track((await s.call('post', '/superadmin/console/intake').send(body).expect(200)).body);
    await request(app.getHttpServer()).post('/superadmin/console/intake').set('Host', 'admin.localhost').send(body).expect(401);
    const tok = (await request(app.getHttpServer()).post('/auth/login').set('Host', `${r.store.subdomain}.localhost`).send({ email: body.email, password: r.ownerLogin.temporaryPassword }).expect(200)).body.accessToken;
    await request(app.getHttpServer()).post('/superadmin/console/intake').set('Host', `${r.store.subdomain}.localhost`).set('Authorization', `Bearer ${tok}`).send(body).expect(403);
  });
});
