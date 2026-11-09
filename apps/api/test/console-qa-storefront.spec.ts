/** QA with the REAL storefront probe: a test order through the storefront's checkout service, its GST invoice PDF, then cancel + restock. */
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { QA_ORDER_NAME } from '../src/console/qa-probes';
import { createApp, deleteTenants, uniq } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

describe('QA runner with the real storefront (S3) checks', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const ids: string[] = [];
  const statusOf = (run: any) => Object.fromEntries(run.results.map((r: any) => [r.id, r.status]));
  const detailOf = (run: any, id: string) => run.results.find((r: any) => r.id === id)?.detail;

  async function store(over: Record<string, unknown> = {}) {
    const k = uniq('qs');
    const r = (await s.call('post', '/superadmin/console/intake').send({
      intakeKey: k, businessName: `QA Shop ${k}`, ownerName: 'Owner', whatsapp: '9877766655', email: `${k}@qs.test`, category: 'Gifts', logoUrl: 'x', brandColors: ['#111111'],
      productSheet: 'p.csv', address: '1 Main Road, Chennai', gstNumber: '33ABCDE1234F1Z5', razorpayStatus: 'not_needed', shipping: { mode: 'FLAT', flatRatePaise: 5000 }, cod: { enabled: true }, aboutText: 'About', ...over,
    }).expect(200)).body;
    ids.push(r.store.id);
    return r.store.id as string;
  }

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

  it('places a real COD order, renders its invoice PDF, then cancels it and puts the stock back; the run passes', async () => {
    const tid = await store();
    const csv = 'name,price,mrp,sku,stock,hsn_code\nCotton towel,199,249,QS-1,5,6302\nSilk scarf,899,999,QS-2,3,6214';
    await s.call('post', `/superadmin/console/stores/${tid}/import/products?filename=p.csv`).set('Content-Type', 'text/csv').send(csv).expect(200);
    const run = (await s.call('post', `/superadmin/console/stores/${tid}/qa`).expect(200)).body;

    expect(statusOf(run)).toMatchObject({ test_order: 'pass', invoice: 'pass', lighthouse_mobile: 'skipped', policy_pages: 'pass', payment_keys: 'skipped' });
    expect(detailOf(run, 'lighthouse_mobile')).toMatch(/^skipped: Lighthouse not installed/);
    expect(detailOf(run, 'invoice')).toMatch(/^Invoice for .+ generated \(PDF, \d+ KB\)$/);
    expect(run.results.find((r: any) => r.id === 'test_order_cleanup')).toBeUndefined();
    expect(run.passed).toBe(true);

    const orders = await prisma.base.order.findMany({ where: { tenantId: tid }, include: { customer: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ orderStatus: 'CANCELLED', paymentMode: 'COD' });
    expect(orders[0].customer).toMatchObject({ name: QA_ORDER_NAME, phone: '9877766655' }); // the store's own number
    expect(detailOf(run, 'test_order')).toContain(orders[0].orderNo);
    // cheapest product was ordered and its stock is back
    const towel = await prisma.base.product.findFirstOrThrow({ where: { tenantId: tid, sku: 'QS-1' } });
    expect(towel.stock).toBe(5);
    // nothing leaked into another store
    expect(await prisma.base.order.count({ where: { tenantId: { in: ids.filter((x) => x !== tid) } } })).toBe(0);
  });

  it('no live product in stock: the test order fails with a plain reason and the invoice check says why', async () => {
    const tid = await store();
    const run = (await s.call('post', `/superadmin/console/stores/${tid}/qa`).expect(200)).body;
    expect(statusOf(run)).toMatchObject({ test_order: 'fail', invoice: 'fail' });
    expect(detailOf(run, 'test_order')).toContain('No live product in stock to order');
    expect(detailOf(run, 'invoice')).toBe('No test order to invoice (the test order check failed)');
    expect(run.passed).toBe(false);
  });
});
