/**
 * Phase 5 isolation: every new model (store_intakes, store_domains, qa_runs, refund_cases, outbox_events) is also
 * covered by the DMMF-driven gate (app layer + RLS). This suite attacks the CONSOLE doors on top of that:
 *  - every /superadmin/console route refuses anonymous callers, store owners and impersonation tokens;
 *  - per-store routes, given store A in the path and store B's row id, never reach B's row;
 *  - the scoped client as tenant A sees none of B's rows in the new models.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, deleteTenants, uniq } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

const NEW_MODELS = ['storeIntake', 'storeDomain', 'qaRun', 'refundCase', 'outboxEvent'] as const;

describe('console isolation (every new model, every console route)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const ids: string[] = [];
  const S: Record<'A' | 'B', any> = {} as any;
  const api = () => request(app.getHttpServer());

  async function seedStore(tag: string) {
    const k = uniq(tag);
    const r = (await s.call('post', '/superadmin/console/intake').send({
      intakeKey: k, businessName: `Iso ${k}`, ownerName: 'O', whatsapp: '9866666666', email: `${k}@iso.test`, category: 'x', logoUrl: 'x', brandColors: ['#111111'],
      productSheet: 'p', address: 'a', razorpayStatus: 'not_needed', shipping: { mode: 'FREE' }, cod: { enabled: true }, aboutText: 'a',
    }).expect(200)).body;
    ids.push(r.store.id);
    const id = r.store.id;
    await s.call('put', `/superadmin/console/stores/${id}/domain`).send({ domain: `${k}.iso-shop.in` }).expect(200);
    const qa = (await s.call('post', `/superadmin/console/stores/${id}/qa`).expect(200)).body;
    await prisma.base.storeIntake.update({ where: { tenantId: id }, data: { completedAt: new Date(Date.now() - 20 * 86_400_000) } });
    const refund = (await s.call('post', `/superadmin/console/stores/${id}/refunds`).send({ reason: 'not_delivered', amountPaidPaise: 118000, gstPaise: 18000, paymentId: 'pay_ISO1' }).expect(201)).body;
    const events = (await s.call('get', `/superadmin/console/stores/${id}/events`).expect(200)).body;
    const tok = (await api().post('/auth/login').set('Host', `${r.store.subdomain}.localhost`).send({ email: `${k}@iso.test`, password: r.ownerLogin.temporaryPassword }).expect(200)).body.accessToken;
    const imp = (await s.call('post', `/superadmin/console/stores/${id}/impersonate`).send({ reason: 'isolation test' }).expect(200)).body;
    const impTok = (await api().post('/auth/impersonate').set('Host', `${r.store.subdomain}.localhost`).send({ code: decodeURIComponent(imp.url.split('code=')[1]) }).expect(200)).body.accessToken;
    return { id, host: `${r.store.subdomain}.localhost`, qaId: qa.id, refundId: refund.id, eventId: events[0].id, ownerTok: tok, impTok };
  }

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    s = await superadminSession(app);
    S.A = await seedStore('isa');
    S.B = await seedStore('isb');
  });
  afterAll(async () => {
    await deleteTenants(prisma.base, ids);
    await cleanupSuperadmin(app, s.id);
    await app.close();
  });

  it('scoped client as A sees none of B\'s rows in any new model (and each model has rows for both)', async () => {
    for (const m of NEW_MODELS) {
      const all: any[] = await (prisma.base as any)[m].findMany({ where: { tenantId: { in: [S.A.id, S.B.id] } } } as any);
      expect(all.some((r: any) => r.tenantId === S.A.id)).toBe(true);
      expect(all.some((r: any) => r.tenantId === S.B.id)).toBe(true);
      const seen = await prisma.runAsTenant(S.A.id, () => (prisma.db as any)[m].findMany({ where: { tenantId: S.B.id } }));
      expect(seen).toEqual([]);
      const mine: any[] = await prisma.runAsTenant(S.A.id, () => (prisma.db as any)[m].findMany());
      expect(mine.every((r: any) => r.tenantId === S.A.id)).toBe(true);
    }
  });

  it('per-store console routes: A in the path + B\'s row id never reaches B', async () => {
    const A = S.A.id, B = S.B;
    await s.call('post', `/superadmin/console/stores/${A}/refunds/${B.refundId}/approve`).send({ confirmPaise: 118000 }).expect(404);
    await s.call('post', `/superadmin/console/stores/${A}/refunds/${B.refundId}/reject`).send({ note: 'nope' }).expect(404);
    await s.call('get', `/superadmin/console/stores/${A}/refunds/${B.refundId}/credit-note`).expect(404);
    await s.call('post', `/superadmin/console/stores/${A}/events/${B.eventId}/redeliver`).expect(404);
    const qaA = (await s.call('get', `/superadmin/console/stores/${A}/qa`).expect(200)).body.runs;
    expect(qaA.map((r: any) => r.id)).not.toContain(B.qaId);
    const evA = (await s.call('get', `/superadmin/console/stores/${A}/events`).expect(200)).body;
    expect(evA.map((e: any) => e.id)).not.toContain(B.eventId);
    const refA = (await s.call('get', `/superadmin/console/stores/${A}/refunds`).expect(200)).body;
    expect(refA.map((r: any) => r.id)).not.toContain(B.refundId);
    expect((await s.call('get', `/superadmin/console/stores/${A}/intake`).expect(200)).body.tenantId).toBe(A);
    expect((await s.call('get', `/superadmin/console/stores/${A}/domain`).expect(200)).body.domain).toContain('isa');
    // B untouched
    expect((await prisma.base.refundCase.findUniqueOrThrow({ where: { id: B.refundId } })).status).toBe('open');
  });

  it('every /superadmin/console route: anonymous 401; store owner and impersonation tokens 403 on the platform host and on their store', async () => {
    const ex: any = app.getHttpAdapter().getInstance();
    const stack: any[] = (ex.router ?? ex._router)?.stack ?? [];
    const routes = stack.filter((l) => l.route?.path?.startsWith('/superadmin/console'))
      .flatMap((l) => Object.keys(l.route.methods).filter((m) => l.route.methods[m]).map((m) => ({ method: m, path: l.route.path as string })));
    expect(routes.length).toBeGreaterThan(40);
    const fill = (p: string) => p.replace(/:id/g, S.A.id).replace(/:caseId/g, S.A.refundId).replace(/:eventId/g, S.A.eventId).replace(/:mediaId/g, S.A.qaId).replace(/:name/g, 'weekly-summary');
    for (const r of routes) {
      const path = fill(r.path);
      const call = (host: string, tok?: string) => { const q = (api() as any)[r.method](path).set('Host', host); return tok ? q.set('Authorization', `Bearer ${tok}`) : q; };
      expect([r.method, r.path, (await call('admin.localhost')).status]).toEqual([r.method, r.path, 401]);
      expect([r.method, r.path, (await call('admin.localhost', S.A.ownerTok)).status]).toEqual([r.method, r.path, 403]);
      expect([r.method, r.path, (await call(S.A.host, S.A.ownerTok)).status]).toEqual([r.method, r.path, 403]);
      expect([r.method, r.path, (await call(S.A.host, S.A.impTok)).status]).toEqual([r.method, r.path, 403]);
    }
  });
});
