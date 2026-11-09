import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { DELIVERY_GUARANTEE, generatePolicies, PolicyInput, REQUIRED_POLICIES, rupees } from '../src/console/policies';
import { createApp, deleteTenants, makeTenant } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

const base: PolicyInput = {
  businessName: 'Kaveri Handlooms', email: 'hello@kaveri.test', whatsapp: '+919800000001', supportPhone: null,
  address: '12 Car Street\nMadurai 625001', gstNumber: '33ABCDE1234F1Z5', storeUrl: 'https://kaveri.store.bmtechx.in',
  shippingMode: 'FREE_ABOVE', flatRatePaise: 6000, freeAbovePaise: 99900, cityRates: [{ city: 'Chennai', ratePaise: 4000 }],
  codEnabled: true, codChargePaise: 5000, onlinePayments: true, effectiveDate: new Date('2026-11-08T06:00:00Z'),
};

describe('policy page generator (pure)', () => {
  it('produces exactly the four required pages, filled from tenant details', () => {
    const pages = generatePolicies(base);
    expect(pages.map((p) => p.slug)).toEqual(REQUIRED_POLICIES.map((p) => p.slug));
    for (const p of pages) {
      expect(p.content).toContain('Kaveri Handlooms');
      expect(p.content).toContain('https://kaveri.store.bmtechx.in');
      expect(p.content).not.toMatch(/undefined|null|NaN|\{\w+\}/);
    }
    const [privacy, terms, refund, shipping] = pages;
    expect(privacy.content).toContain('hello@kaveri.test');
    expect(privacy.content).toContain('Razorpay');
    expect(terms.content).toContain('GSTIN 33ABCDE1234F1Z5');
    expect(terms.content).toContain('12 Car Street, Madurai 625001');
    expect(shipping.content).toContain('free on orders of ₹999 or more');
    expect(shipping.content).toContain('Chennai: ₹40');
    expect(shipping.content).toContain('₹50 COD charge');
    expect(refund.content).toContain('Store setup guarantee');
  });

  it('the Refund page states the delivery guarantee word for word', () => {
    const refund = generatePolicies(base)[2].content;
    expect(refund).toContain('not live within 7 working days of a completed intake');
    expect(refund).toContain('full refund including GST, with a credit note, processed within 7 working days');
    expect(refund).toContain('Not covered: delays on the client side (details sent late, Razorpay KYC not completed) and change of mind after go-live.');
    for (const t of DELIVERY_GUARANTEE.text) expect(refund).toContain(t);
  });

  it('leaves out what it does not know instead of inventing it', () => {
    const pages = generatePolicies({ ...base, email: null, whatsapp: null, address: null, gstNumber: null, onlinePayments: false, codEnabled: false, shippingMode: 'FLAT', flatRatePaise: 0, freeAbovePaise: null, cityRates: [] });
    const all = pages.map((p) => p.content).join('\n');
    expect(all).not.toContain('GSTIN');
    expect(all).not.toContain('Razorpay\'s secure');
    expect(all).toContain('Through the contact options on https://kaveri.store.bmtechx.in');
    expect(all).toContain('Shipping charges are shown at checkout');
    expect(all).not.toMatch(/\brating|review|testimonial|happy customers|orders delivered/i);
  });

  it('formats paise as rupees', () => {
    expect(rupees(99900)).toBe('₹999');
    expect(rupees(12345)).toBe('₹123.45');
    expect(rupees(10000000)).toBe('₹1,00,000');
  });
});

describe('policy pages via the console API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const ids: string[] = [];

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

  it('writes the four pages into the store, keeps edited pages unless overwrite, and audits it', async () => {
    const t = await makeTenant(prisma.base, { name: 'Malli Stores', whatsappNumber: '+919800000002', address: 'Trichy' });
    ids.push(t.id);
    const r1 = (await s.call('post', `/superadmin/console/stores/${t.id}/policies`).send({ overwrite: false }).expect(200)).body;
    expect(r1.map((x: any) => x.action)).toEqual(['created', 'created', 'created', 'created']);
    const pages = await prisma.runAsTenant(t.id, () => prisma.db.page.findMany({ where: { isPolicy: true } }));
    expect(pages).toHaveLength(4);
    expect(pages.every((p) => p.content.includes('Malli Stores'))).toBe(true);

    await prisma.runAsTenant(t.id, () => prisma.db.page.updateMany({ where: { slug: 'shipping-policy' }, data: { content: 'edited by developer' } }));
    const r2 = (await s.call('post', `/superadmin/console/stores/${t.id}/policies`).send({ overwrite: false }).expect(200)).body;
    expect(r2.find((x: any) => x.slug === 'shipping-policy').action).toBe('kept');
    const r3 = (await s.call('post', `/superadmin/console/stores/${t.id}/policies`).send({ overwrite: true }).expect(200)).body;
    expect(r3.find((x: any) => x.slug === 'shipping-policy').action).toBe('updated');

    const audit = await prisma.base.auditLog.findMany({ where: { tenantId: t.id, action: 'console.policies_generated' } });
    expect(audit).toHaveLength(3);
    expect(audit[0].actorId).toBe(s.id);
  });

  it('preview does not write', async () => {
    const t = await makeTenant(prisma.base);
    ids.push(t.id);
    const r = (await s.call('get', `/superadmin/console/stores/${t.id}/policies/preview`).expect(200)).body;
    expect(r).toHaveLength(4);
    expect(await prisma.base.page.count({ where: { tenantId: t.id } })).toBe(0);
  });

  it('unknown store is a 404', async () => {
    await s.call('post', `/superadmin/console/stores/00000000-0000-4000-8000-000000000000/policies`).send({}).expect(404);
  });
});
