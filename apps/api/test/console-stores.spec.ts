import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { RefundGateway, RefundResult } from '../src/console/refund-gateway';
import { StubNotifier } from '../src/notify/notifier';
import { PrismaService } from '../src/prisma/prisma.service';
import { deleteTenants, uniq } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

class FakeGateway extends RefundGateway {
  calls: Array<{ paymentId: string; amount: number }> = [];
  next: RefundResult = { ok: true, stub: false, refundId: 'rfnd_test_123' };
  async refund(paymentId: string, amount: number) { this.calls.push({ paymentId, amount }); return this.next; }
}

describe('console: stores, lifecycle, impersonation, renewals, usage, refunds, attention', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const gw = new FakeGateway();
  const ids: string[] = [];
  const api = () => request(app.getHttpServer());

  async function store(over: Record<string, unknown> = {}) {
    const k = uniq('st');
    const r = (await s.call('post', '/superadmin/console/intake').send({
      intakeKey: k, businessName: `Store ${k}`, ownerName: 'O', whatsapp: '9800000021', email: `${k}@st.test`, category: 'Gifts', logoUrl: 'x', brandColors: ['#111111'],
      productSheet: 'p.csv', address: 'Chennai', razorpayStatus: 'not_needed', shipping: { mode: 'FLAT', flatRatePaise: 5000 }, cod: { enabled: true }, aboutText: 'About', ...over,
    }).expect(200)).body;
    ids.push(r.store.id);
    return r;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RefundGateway).useValue(gw).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    s = await superadminSession(app);
  });
  afterAll(async () => {
    await deleteTenants(prisma.base, ids);
    await cleanupSuperadmin(app, s.id);
    await app.close();
  });

  it('go-live is refused until QA passes (and is fresh); then LIVE, plan of 365 days, owner told, preview header gone', async () => {
    const r = await store();
    const id = r.store.id;
    let d = (await s.call('get', `/superadmin/console/stores/${id}`).expect(200)).body;
    expect(d).toMatchObject({ stage: 'building', canGoLive: false, goLiveBlocker: 'Run QA first' });
    expect(d.tenant.razorpayKeyEnc).toBeUndefined();
    expect((await s.call('post', `/superadmin/console/stores/${id}/go-live`).expect(409)).body.message).toBe('Run QA first');

    // failing QA blocks
    await prisma.runAsTenant(id, () => prisma.db.page.deleteMany({ where: { slug: 'privacy-policy' } }));
    await s.call('post', `/superadmin/console/stores/${id}/qa`).expect(200);
    d = (await s.call('get', `/superadmin/console/stores/${id}`).expect(200)).body;
    expect(d).toMatchObject({ stage: 'qa', goLiveBlocker: 'Latest QA failed' });
    expect(d.qa.failed).toEqual(['4 policy pages present']);
    await s.call('post', `/superadmin/console/stores/${id}/go-live`).expect(409);

    // stale pass blocks
    await s.call('post', `/superadmin/console/stores/${id}/policies`).send({ overwrite: false }).expect(200);
    const run = (await s.call('post', `/superadmin/console/stores/${id}/qa`).expect(200)).body;
    expect(run.passed).toBe(true);
    await prisma.base.qaRun.update({ where: { id: run.id }, data: { finishedAt: new Date(Date.now() - 25 * 3_600_000) } });
    expect((await s.call('post', `/superadmin/console/stores/${id}/go-live`).expect(409)).body.message).toContain('older than 24 hours');
    await prisma.base.qaRun.update({ where: { id: run.id }, data: { finishedAt: new Date() } });
    expect((await s.call('get', `/superadmin/console/stores/${id}`).expect(200)).body.stage).toBe('review');

    const before = (await api().get('/health').set('Host', `${r.store.subdomain}.localhost`)).headers['x-robots-tag'];
    expect(before).toBe('noindex, nofollow');
    const notifier = app.get(StubNotifier);
    d = (await s.call('post', `/superadmin/console/stores/${id}/go-live`).expect(200)).body;
    expect(d).toMatchObject({ status: 'LIVE', stage: 'live', planDay: 0 });
    expect(d.daysToExpiry).toBeGreaterThanOrEqual(364);
    expect(notifier.sentTo('9800000021', 'store_live')).toHaveLength(1);
    const after = await api().get('/health').set('Host', `${r.store.subdomain}.localhost`).expect(200);
    expect(after.headers['x-robots-tag']).toBeUndefined();
    expect(await prisma.base.auditLog.count({ where: { tenantId: id, action: 'tenant.went_live' } })).toBe(1);
    await s.call('post', `/superadmin/console/stores/${id}/go-live`).expect(409);
  });

  it('suspend / unsuspend (back to BUILDING if never live) / extend expiry (renewal brings an expired store back)', async () => {
    const r = await store();
    const id = r.store.id;
    await s.call('post', `/superadmin/console/stores/${id}/suspend`).send({ reason: 'test' }).expect(200);
    await api().get('/health').set('Host', `${r.store.subdomain}.localhost`).expect(403);
    const u = (await s.call('post', `/superadmin/console/stores/${id}/unsuspend`).send({}).expect(200)).body;
    expect(u.status).toBe('BUILDING'); // never skips QA

    // a live store whose plan ran out and was suspended
    const past = new Date(Date.now() - 2 * 86_400_000);
    await prisma.base.tenant.update({ where: { id }, data: { status: 'SUSPENDED', wentLiveAt: new Date(Date.now() - 367 * 86_400_000), expiresAt: past } });
    const e = (await s.call('post', `/superadmin/console/stores/${id}/extend`).send({ days: 365 }).expect(200)).body;
    expect(e.status).toBe('LIVE');
    expect(e.daysToExpiry).toBeGreaterThanOrEqual(364);
    const e2 = (await s.call('post', `/superadmin/console/stores/${id}/extend`).send({ days: 30 }).expect(200)).body;
    expect(e2.daysToExpiry - e.daysToExpiry).toBe(30); // extends from the current expiry, not from today
    await s.call('post', `/superadmin/console/stores/${id}/extend`).send({ days: 0 }).expect(400);
  });

  it('impersonate: needs a reason, audited; one-time code works once, only on that store\'s host; 15-minute owner token, no refresh', async () => {
    const r = await store();
    const other = await store();
    const id = r.store.id;
    await s.call('post', `/superadmin/console/stores/${id}/impersonate`).send({ reason: 'x' }).expect(400);
    const imp = (await s.call('post', `/superadmin/console/stores/${id}/impersonate`).send({ reason: 'client asked for help with photos' }).expect(200)).body;
    expect(imp.url).toMatch(new RegExp(`^http://${r.store.subdomain}\\.localhost:3001/api/auth/impersonate\\?code=`));
    const code = decodeURIComponent(imp.url.split('code=')[1]);

    await api().post('/auth/impersonate').set('Host', `${other.store.subdomain}.localhost`).send({ code }).expect(403); // wrong store: and the code is burnt
    const imp2 = (await s.call('post', `/superadmin/console/stores/${id}/impersonate`).send({ reason: 'client asked for help with photos' }).expect(200)).body;
    const code2 = decodeURIComponent(imp2.url.split('code=')[1]);
    await api().post('/auth/impersonate').set('Host', 'admin.localhost').send({ code: code2 }).expect(403); // platform host
    const tok = (await api().post('/auth/impersonate').set('Host', `${r.store.subdomain}.localhost`).send({ code: code2 }).expect(200)).body;
    expect(tok.refreshToken).toBe('');
    await api().post('/auth/impersonate').set('Host', `${r.store.subdomain}.localhost`).send({ code: code2 }).expect(403); // single use
    const me = await api().get('/store/me').set('Host', `${r.store.subdomain}.localhost`).set('Authorization', `Bearer ${tok.accessToken}`).expect(200);
    expect(me.body.role ?? me.body.user?.role).toBeDefined();
    await api().get('/store/me').set('Host', `${other.store.subdomain}.localhost`).set('Authorization', `Bearer ${tok.accessToken}`).expect(403);
    const audit = await prisma.base.auditLog.findMany({ where: { tenantId: id, action: { in: ['tenant.impersonation_started', 'console.impersonation_started', 'console.impersonation_redeemed'] } } });
    expect(audit.map((a) => a.action).sort()).toEqual(['console.impersonation_redeemed', 'console.impersonation_started', 'console.impersonation_started', 'tenant.impersonation_started', 'tenant.impersonation_started']);
    expect(audit.find((a) => a.action === 'tenant.impersonation_started')!.meta).toMatchObject({ reason: 'client asked for help with photos' });
    expect(audit.every((a) => a.actorId === s.id)).toBe(true);
  });

  it('stores list with stage badges and counts; renewals from day 305 with day 305 / 335 milestones; usage vs fair-use', async () => {
    const live = await store();
    await prisma.base.tenant.update({ where: { id: live.store.id }, data: { status: 'LIVE', wentLiveAt: new Date(Date.now() - 336 * 86_400_000), expiresAt: new Date(Date.now() + 29 * 86_400_000) } });
    const partial = (await s.call('post', '/superadmin/console/intake').send({ businessName: `Partial ${uniq()}` }).expect(200)).body;
    ids.push(partial.store.id);
    await prisma.base.tenantUsage.upsert({ where: { tenantId: partial.store.id }, create: { tenantId: partial.store.id, productCount: 1900, mediaBytes: 0n }, update: { productCount: 1900 } });

    const list = (await s.call('get', '/superadmin/console/stores').expect(200)).body;
    expect(list.stages.map((x: any) => x.id)).toEqual(['intake', 'building', 'qa', 'review', 'live', 'expiring', 'parked']);
    const byId = Object.fromEntries(list.items.map((c: any) => [c.id, c]));
    expect(byId[live.store.id]).toMatchObject({ stage: 'expiring', stageLabel: 'Expiring', planDay: 336 });
    expect(byId[partial.store.id]).toMatchObject({ stage: 'intake', stageLabel: 'Intake received' });
    const onlyIntake = (await s.call('get', '/superadmin/console/stores?stage=intake').expect(200)).body.items;
    expect(onlyIntake.every((c: any) => c.stage === 'intake')).toBe(true);

    const ren = (await s.call('get', '/superadmin/console/renewals').expect(200)).body;
    const mine = ren.find((x: any) => x.id === live.store.id);
    expect(mine.milestones).toEqual([{ day: 305, reached: true }, { day: 335, reached: true }]);

    const usage = (await s.call('get', '/superadmin/console/usage').expect(200)).body;
    const u = usage.find((x: any) => x.id === partial.store.id);
    expect(u).toMatchObject({ products: 1900, maxProducts: 2000, maxMediaMb: 10240, warning: true });
  });

  it('needs attention: stuck intake, missed delivery deadline, failed QA, ready to go live, expiring, usage', async () => {
    const stuck = (await s.call('post', '/superadmin/console/intake').send({ businessName: `Stuck ${uniq()}` }).expect(200)).body;
    ids.push(stuck.store.id);
    await prisma.base.storeIntake.update({ where: { tenantId: stuck.store.id }, data: { receivedAt: new Date(Date.now() - 8 * 86_400_000), chasersSent: 3 } });
    const late = await store();
    await prisma.base.storeIntake.update({ where: { tenantId: late.store.id }, data: { completedAt: new Date(Date.now() - 20 * 86_400_000) } });
    const failing = await store();
    await prisma.runAsTenant(failing.store.id, () => prisma.db.page.deleteMany({ where: { isPolicy: true } }));
    await s.call('post', `/superadmin/console/stores/${failing.store.id}/qa`).expect(200);

    const att = (await s.call('get', '/superadmin/console/attention').expect(200)).body;
    const kinds = (id: string) => att.items.filter((i: any) => i.store.id === id).map((i: any) => i.kind);
    expect(kinds(stuck.store.id)).toContain('stuck_intake');
    expect(att.items.find((i: any) => i.store.id === stuck.store.id && i.kind === 'stuck_intake').severity).toBe('high');
    expect(kinds(late.store.id)).toContain('deadline_missed');
    expect(kinds(failing.store.id)).toEqual(['qa_failed']); // deadline still 7 working days away
    expect(att.items[0].severity).toBe('high');
    expect(att.counts).toHaveProperty('intake');
  });

  it('refund helper: shows the case, applies the rule, human approves with the amount, gateway refund + credit note; double approval impossible', async () => {
    const r = await store();
    const id = r.store.id;
    // intake completed 20 days ago, never went live => eligible
    await prisma.base.storeIntake.update({ where: { tenantId: id }, data: { completedAt: new Date(Date.now() - 20 * 86_400_000) } });
    const facts = { reason: 'not_delivered', amountPaidPaise: 1_180_000, gstPaise: 180_000, paymentId: 'pay_TEST123', invoiceRef: 'BMT/2026-27/0042' };
    const pv = (await s.call('post', `/superadmin/console/stores/${id}/refunds/preview`).send(facts).expect(200)).body;
    expect(pv).toMatchObject({ eligible: true, rule: 'not_delivered', refundPaise: 1_180_000 });
    expect(await prisma.base.refundCase.count({ where: { tenantId: id } })).toBe(0);

    const c = (await s.call('post', `/superadmin/console/stores/${id}/refunds`).send(facts).expect(201)).body;
    expect(c).toMatchObject({ status: 'open', eligible: true });
    await s.call('post', `/superadmin/console/stores/${id}/refunds/${c.id}/approve`).send({ confirmPaise: 1_000_000 }).expect(400); // wrong amount typed
    const done = (await s.call('post', `/superadmin/console/stores/${id}/refunds/${c.id}/approve`).send({ confirmPaise: 1_180_000 }).expect(200)).body;
    expect(done).toMatchObject({ status: 'refunded', refundId: 'rfnd_test_123', refundStub: false, approvedBy: s.id });
    expect(done.creditNoteNo).toMatch(/^CN\/\d{4}-\d{2}\/\d{4}$/);
    expect(done.creditNote).toMatchObject({ totalPaise: 1_180_000, gstPaise: 180_000, taxablePaise: 1_000_000 });
    expect(new Date(done.processBy).getTime()).toBeGreaterThan(new Date(done.approvedAt).getTime());
    expect(gw.calls).toEqual([{ paymentId: 'pay_TEST123', amount: 1_180_000 }]);
    await s.call('post', `/superadmin/console/stores/${id}/refunds/${c.id}/approve`).send({ confirmPaise: 1_180_000 }).expect(409);
    expect(gw.calls).toHaveLength(1);
    const html = await s.call('get', `/superadmin/console/stores/${id}/refunds/${c.id}/credit-note`).expect(200);
    expect(html.text).toContain(done.creditNoteNo);
    expect(html.text).toContain('₹11,800');

    // concurrent double click on a fresh case: one refund only
    const c2 = (await s.call('post', `/superadmin/console/stores/${id}/refunds`).send({ ...facts, paymentId: 'pay_TEST124' }).expect(201)).body;
    const both = await Promise.all([1, 2].map(() => s.call('post', `/superadmin/console/stores/${id}/refunds/${c2.id}/approve`).send({ confirmPaise: 1_180_000 })));
    expect(both.map((b) => b.status).sort()).toEqual([200, 409]);
    expect(gw.calls.filter((x) => x.paymentId === 'pay_TEST124')).toHaveLength(1);
  });

  it('refund helper: not eligible cannot be approved; a gateway failure is recorded and can be retried; reject', async () => {
    const r = await store();
    const id = r.store.id;
    const facts = { reason: 'change_of_mind', amountPaidPaise: 590_000, gstPaise: 90_000, paymentId: 'pay_LIVEONTIME' };
    await prisma.base.tenant.update({ where: { id }, data: { status: 'LIVE', wentLiveAt: new Date() } });
    const c = (await s.call('post', `/superadmin/console/stores/${id}/refunds`).send(facts).expect(201)).body;
    expect(c.eligible).toBe(false);
    expect(c.decision.rule).toBe('delivered_on_time');
    expect((await s.call('post', `/superadmin/console/stores/${id}/refunds/${c.id}/approve`).send({ confirmPaise: 590_000 }).expect(400)).body.message).toContain('Not eligible');
    const rej = (await s.call('post', `/superadmin/console/stores/${id}/refunds/${c.id}/reject`).send({ note: 'delivered on time' }).expect(200)).body;
    expect(rej.status).toBe('rejected');

    const r2 = await store();
    await prisma.base.storeIntake.update({ where: { tenantId: r2.store.id }, data: { completedAt: new Date(Date.now() - 20 * 86_400_000) } });
    const c2 = (await s.call('post', `/superadmin/console/stores/${r2.store.id}/refunds`).send({ reason: 'not_delivered', amountPaidPaise: 590_000, gstPaise: 90_000, paymentId: 'pay_FAILS' }).expect(201)).body;
    gw.next = { ok: false, stub: false, error: 'Razorpay 400: payment not captured' };
    const f = (await s.call('post', `/superadmin/console/stores/${r2.store.id}/refunds/${c2.id}/approve`).send({ confirmPaise: 590_000 }).expect(200)).body;
    expect(f).toMatchObject({ status: 'failed', refundError: 'Razorpay 400: payment not captured', creditNoteNo: null });
    gw.next = { ok: true, stub: false, refundId: 'rfnd_test_retry' };
    const ok = (await s.call('post', `/superadmin/console/stores/${r2.store.id}/refunds/${c2.id}/approve`).send({ confirmPaise: 590_000 }).expect(200)).body;
    expect(ok).toMatchObject({ status: 'refunded', refundId: 'rfnd_test_retry' });

    // another store's case is invisible through this store's door
    await s.call('post', `/superadmin/console/stores/${id}/refunds/${c2.id}/approve`).send({ confirmPaise: 590_000 }).expect(404);
    const listA = (await s.call('get', `/superadmin/console/stores/${id}/refunds`).expect(200)).body;
    expect(listA.map((x: any) => x.id)).toEqual([c.id]);
    const queue = (await s.call('get', '/superadmin/console/refunds').expect(200)).body;
    expect(queue.find((x: any) => x.id === c2.id).tenant.id).toBe(r2.store.id);
  });
});
