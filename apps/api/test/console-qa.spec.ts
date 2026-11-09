import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { TenantSecretsService } from '../src/crypto/tenant-secrets.service';
import { ProbeSkipped, RazorpayProbe, StorefrontProbe, StorefrontTarget } from '../src/console/qa-probes';
import { Notifier, Notice, StubNotifier } from '../src/notify/notifier';
import { PrismaService } from '../src/prisma/prisma.service';
import { deleteTenants, uniq } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

/** Switchable storefront probe for the failure paths (the real in-process probe is tested in console-qa-storefront.spec.ts). */
const LH_SKIP = 'skipped: Lighthouse not installed on this server (set LIGHTHOUSE_BIN and CHROME_PATH)';
class FakeStorefront extends StorefrontProbe {
  order: 'ok' | 'throw' = 'ok';
  invoiceNo = 'INV-0001';
  score: number | null = null; // null = Lighthouse not configured
  cleaned: string[] = [];
  cleanupFails = false;
  async placeTestOrder(_t: StorefrontTarget) { if (this.order === 'throw') throw new Error('checkout returned 500'); return { orderNo: 'TEST-1', orderId: 'o-1', totalPaise: 10000 }; }
  async fetchInvoice() { return { invoiceNo: this.invoiceNo, totalPaise: 10000, bytes: 4096 }; }
  async cleanup(_t: StorefrontTarget, orderId: string) { if (this.cleanupFails) throw new Error('db down'); this.cleaned.push(orderId); }
  async lighthouseMobile() { if (this.score === null) throw new ProbeSkipped(LH_SKIP); return { performance: this.score }; }
}
class FakeRazorpay extends RazorpayProbe {
  mode: 'ok' | 'reject' | 'crash' = 'ok';
  seen: string[] = [];
  async verify(keyId: string) {
    this.seen.push(keyId);
    if (this.mode === 'crash') throw new Error('socket hang up');
    return this.mode === 'ok' ? { ok: true, detail: 'Razorpay accepted the keys' } : { ok: false, detail: 'Razorpay rejected the keys (401): check the key id and secret' };
  }
}
class FlakyNotifier extends StubNotifier {
  fail = false;
  override async send(n: Notice) { return this.fail ? { delivered: false, transport: 'stub', id: 'x', detail: 'provider down' } : super.send(n); }
}

describe('QA runner', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const sf = new FakeStorefront();
  const rzp = new FakeRazorpay();
  const notifier = new FlakyNotifier();
  const ids: string[] = [];
  const statusOf = (run: any) => Object.fromEntries(run.results.map((r: any) => [r.id, r.status]));
  const detailOf = (run: any, id: string) => run.results.find((r: any) => r.id === id).detail;

  async function store(over: Record<string, unknown> = {}) {
    const k = uniq('qa');
    const r = (await s.call('post', '/superadmin/console/intake').send({
      intakeKey: k, businessName: `QA ${k}`, ownerName: 'O', whatsapp: '9800000011', email: `${k}@qa.test`, category: 'Gifts', logoUrl: 'x', brandColors: ['#111111'],
      productSheet: 'p.csv', address: 'Chennai', razorpayStatus: 'active', shipping: { mode: 'FLAT', flatRatePaise: 5000 }, cod: { enabled: true }, aboutText: 'About', ...over,
    }).expect(200)).body;
    ids.push(r.store.id);
    return r.store.id as string;
  }
  const setKeys = (tid: string, keyId: string) => prisma.runAsTenant(tid, () => app.get(TenantSecretsService).setRazorpay(keyId, 'secret-value-123'));
  const run = async (tid: string) => (await s.call('post', `/superadmin/console/stores/${tid}/qa`).expect(200)).body;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorefrontProbe).useValue(sf).overrideProvider(RazorpayProbe).useValue(rzp)
      .overrideProvider(Notifier).useValue(notifier).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    s = await superadminSession(app);
  });
  afterEach(() => { sf.order = 'ok'; sf.score = null; sf.cleanupFails = false; sf.invoiceNo = 'INV-0001'; rzp.mode = 'ok'; notifier.fail = false; });
  afterAll(async () => {
    await deleteTenants(prisma.base, ids);
    await cleanupSuperadmin(app, s.id);
    await app.close();
  });

  it('a good store passes; Lighthouse without LIGHTHOUSE_BIN is skipped with the reason; the test order is always cleaned up', async () => {
    const tid = await store();
    await setKeys(tid, 'rzp_live_abcd1234');
    const r = await run(tid);
    expect(statusOf(r)).toEqual({ test_order: 'pass', invoice: 'pass', owner_alert: 'pass', lighthouse_mobile: 'skipped', ssl_valid: 'skipped', policy_pages: 'pass', payment_keys: 'pass' });
    expect(detailOf(r, 'lighthouse_mobile')).toBe(LH_SKIP);
    expect(sf.cleaned).toContain('o-1');
    expect(detailOf(r, 'ssl_valid')).toBe('SSL check skipped locally');
    expect(detailOf(r, 'owner_alert')).toContain('stub transport');
    expect(r.passed).toBe(true);
    expect(notifier.sentTo('9800000011', 'qa_owner_alert_test')).toHaveLength(1);
    expect(r.results.every((x: any) => typeof x.durationMs === 'number' && x.label)).toBe(true);
  });

  it('FAIL: policy pages missing or emptied', async () => {
    const tid = await store();
    await setKeys(tid, 'rzp_live_abcd1234');
    await prisma.runAsTenant(tid, () => prisma.db.page.updateMany({ where: { slug: 'refund-and-returns' }, data: { content: 'tbd' } }));
    await prisma.runAsTenant(tid, () => prisma.db.page.deleteMany({ where: { slug: 'privacy-policy' } }));
    const r = await run(tid);
    expect(r.passed).toBe(false);
    expect(statusOf(r).policy_pages).toBe('fail');
    expect(detailOf(r, 'policy_pages')).toBe('Missing or empty: Privacy Policy, Refund and Returns Policy');
  });

  it('FAIL: payment keys missing / test-mode / rejected / Razorpay unreachable; SKIP when COD-only', async () => {
    const tid = await store({ razorpayStatus: 'kyc_pending' });
    let r = await run(tid);
    expect(statusOf(r).payment_keys).toBe('fail');
    expect(detailOf(r, 'payment_keys')).toBe('Razorpay keys not set (client KYC pending)');

    await setKeys(tid, 'rzp_test_abcd1234');
    r = await run(tid);
    expect(detailOf(r, 'payment_keys')).toBe('Test-mode keys: add the live keys before go-live');

    await setKeys(tid, 'rzp_live_wrong999');
    rzp.mode = 'reject';
    r = await run(tid);
    expect(r.passed).toBe(false);
    expect(detailOf(r, 'payment_keys')).toContain('rejected the keys');

    rzp.mode = 'crash';
    r = await run(tid);
    expect(statusOf(r).payment_keys).toBe('fail');
    expect(detailOf(r, 'payment_keys')).toBe('Check crashed: socket hang up');
    expect(statusOf(r).policy_pages).toBe('pass'); // one crash never takes the other checks down

    const cod = await store({ razorpayStatus: 'not_needed', cod: { enabled: true } });
    r = await run(cod);
    expect(statusOf(r).payment_keys).toBe('skipped');
    expect(r.passed).toBe(true);
  });

  it('FAIL: owner alert not delivered, or nobody to alert', async () => {
    const tid = await store({ razorpayStatus: 'not_needed' });
    notifier.fail = true;
    let r = await run(tid);
    expect(statusOf(r).owner_alert).toBe('fail');
    expect(detailOf(r, 'owner_alert')).toBe('Alert not delivered: provider down');
    notifier.fail = false;
    await prisma.base.tenant.update({ where: { id: tid }, data: { whatsappNumber: null } });
    await prisma.base.user.updateMany({ where: { tenantId: tid }, data: { isActive: false } });
    r = await run(tid);
    expect(detailOf(r, 'owner_alert')).toBe('No owner WhatsApp number or email to alert');
  });

  it('Lighthouse below 85 fails; a failed test order fails the invoice too; a failed cleanup is reported', async () => {
    const tid = await store({ razorpayStatus: 'not_needed' });
    sf.score = 92;
    let r = await run(tid);
    expect(statusOf(r)).toMatchObject({ test_order: 'pass', invoice: 'pass', lighthouse_mobile: 'pass' });
    expect(detailOf(r, 'invoice')).toBe('Invoice for INV-0001 generated (PDF, 4 KB)');
    expect(r.passed).toBe(true);

    sf.score = 71;
    r = await run(tid);
    expect(statusOf(r).lighthouse_mobile).toBe('fail');
    expect(detailOf(r, 'lighthouse_mobile')).toBe('Mobile performance 71 (needs 85+)');
    expect(r.passed).toBe(false);

    sf.score = 90;
    sf.order = 'throw';
    r = await run(tid);
    expect(statusOf(r)).toMatchObject({ test_order: 'fail', invoice: 'fail' });
    expect(detailOf(r, 'test_order')).toBe('Check crashed: checkout returned 500');
    expect(detailOf(r, 'invoice')).toBe('No test order to invoice (the test order check failed)');

    sf.order = 'ok';
    sf.invoiceNo = '';
    r = await run(tid);
    expect(detailOf(r, 'invoice')).toBe('Invoice has no number');

    sf.invoiceNo = 'INV-0002';
    sf.cleanupFails = true;
    r = await run(tid);
    expect(statusOf(r).test_order_cleanup).toBe('fail');
    expect(detailOf(r, 'test_order_cleanup')).toBe('Cancel it by hand: db down');
    expect(r.passed).toBe(false);
  });

  it('runs are stored per store and listed newest first; another store never sees them', async () => {
    const [a, b] = [await store({ razorpayStatus: 'not_needed' }), await store({ razorpayStatus: 'not_needed' })];
    await run(a);
    await run(a);
    const ha = (await s.call('get', `/superadmin/console/stores/${a}/qa`).expect(200)).body.runs;
    const hb = (await s.call('get', `/superadmin/console/stores/${b}/qa`).expect(200)).body.runs;
    expect(ha).toHaveLength(2);
    expect(ha.every((x: any) => x.tenantId === a && x.triggeredBy === s.id)).toBe(true);
    expect(hb).toHaveLength(0);
    expect(new Date(ha[0].startedAt).getTime()).toBeGreaterThanOrEqual(new Date(ha[1].startedAt).getTime());
    const checks = (await s.call('get', '/superadmin/console/qa/checks').expect(200)).body;
    expect(checks.checks).toHaveLength(7);
  });
});
