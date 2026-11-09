import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { AppConfig } from '../src/config/app-config';
import { signWebhook, WebhookService } from '../src/console/webhooks';
import { JobsScheduler } from '../src/jobs/jobs.scheduler';
import { JOB_NAMES, PlatformJobsService } from '../src/jobs/platform-jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, deleteTenants, uniq } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

const SECRET = 'whsec-test-0123456789';
const DAY = 86_400_000;
interface Hit { headers: Record<string, string>; raw: string; body: any }

describe('outbound n8n webhooks', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cfg: any;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  let server: Server;
  let url: string;
  let failNext = 0;
  const hits: Hit[] = [];
  const ids: string[] = [];
  const full = (k: string) => ({
    intakeKey: k, businessName: `Hook ${k}`, ownerName: 'Meena', whatsapp: '9855555555', email: `${k}@hook.test`, category: 'Gifts', logoUrl: 'x', brandColors: ['#111111'],
    productSheet: 'p.csv', address: 'Salem', razorpayStatus: 'not_needed', shipping: { mode: 'FREE' }, cod: { enabled: true }, aboutText: 'About us',
  });
  const forStore = (id: string) => hits.filter((h) => h.body.store?.id === id);

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (failNext > 0) { failNext--; res.statusCode = 500; res.end('nope'); return; }
        hits.push({ headers: req.headers as Record<string, string>, raw, body: JSON.parse(raw) });
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook/bmstore`;
    app = await createApp();
    prisma = app.get(PrismaService);
    cfg = app.get(AppConfig);
    cfg.n8nWebhookUrl = url;
    cfg.webhookSecret = SECRET;
    s = await superadminSession(app);
  });
  afterAll(async () => {
    await deleteTenants(prisma.base, ids);
    await cleanupSuperadmin(app, s.id);
    await app.close();
    server.close();
  });

  it('store created + intake complete -> QA result -> go-live -> renewal due, each signed and n8n-shaped; no secrets', async () => {
    const k = uniq('wh');
    const r = (await s.call('post', '/superadmin/console/intake').send(full(k)).expect(200)).body;
    ids.push(r.store.id);
    expect(forStore(r.store.id).map((h) => h.body.event)).toEqual(['store.created', 'intake.completed']);

    const h = forStore(r.store.id)[0];
    expect(h.headers['x-bmstore-event']).toBe('store.created');
    expect(h.headers['x-bmstore-delivery']).toBe(h.body.id);
    expect(h.headers['x-bmstore-signature']).toBe(signWebhook(SECRET, Number(h.headers['x-bmstore-timestamp']), h.raw));
    expect(h.body).toMatchObject({ event: 'store.created', store: { id: r.store.id, name: `Hook ${k}`, status: 'BUILDING', url: r.store.url }, contact: { ownerName: 'Meena', whatsapp: '9855555555', email: `${k}@hook.test` } });
    expect(h.raw).not.toContain(r.ownerLogin.temporaryPassword);
    expect(h.raw).not.toMatch(/password|secret|razorpay_key|Enc"/i);

    // same intake again: no second store.created
    await s.call('post', '/superadmin/console/intake').send(full(k)).expect(200);
    expect(forStore(r.store.id).filter((x) => x.body.event === 'store.created')).toHaveLength(1);

    await s.call('post', `/superadmin/console/stores/${r.store.id}/import/products?filename=p.csv`).set('Content-Type', 'text/csv').send('name,price,mrp,sku,stock\nMug,199,249,M-1,5').expect(200);
    await s.call('post', `/superadmin/console/stores/${r.store.id}/qa`).expect(200);
    const qa = forStore(r.store.id).find((x) => x.body.event === 'qa.result')!;
    expect(qa.body.data).toMatchObject({ passed: true, failed: [] });
    expect(qa.body.data.skipped).toEqual(expect.arrayContaining(['lighthouse_mobile']));
    expect(qa.body.data.skipped).not.toContain('test_order');

    await s.call('post', `/superadmin/console/stores/${r.store.id}/go-live`).expect(200);
    const live = forStore(r.store.id).find((x) => x.body.event === 'store.live')!;
    expect(live.body.store.status).toBe('LIVE');
    expect(live.body.data.expiresAt).toBeTruthy();

    const t = await prisma.base.tenant.findUniqueOrThrow({ where: { id: r.store.id } });
    await app.get(PlatformJobsService).renewalReminders(new Date(t.wentLiveAt!.getTime() + 306 * DAY));
    const ren = forStore(r.store.id).filter((x) => x.body.event === 'renewal.due');
    expect(ren).toHaveLength(1);
    expect(ren[0].body.data).toMatchObject({ planDay: 305 });

    // all recorded as sent in the store's outbox
    const rows = await prisma.base.outboxEvent.findMany({ where: { tenantId: r.store.id, kind: 'webhook' } });
    expect(rows.map((x) => x.event).sort()).toEqual(['intake.completed', 'qa.result', 'renewal.due', 'store.created', 'store.live']);
    expect(rows.every((x) => x.status === 'sent' && x.attempts === 1)).toBe(true);
  });

  it('receiver down: recorded as failed with the reason, redelivered from the console with the same delivery id', async () => {
    failNext = 2;
    const r = (await s.call('post', '/superadmin/console/intake').send({ intakeKey: uniq('wf'), businessName: `Fail ${uniq()}` }).expect(200)).body;
    ids.push(r.store.id);
    const ev = (await s.call('get', `/superadmin/console/stores/${r.store.id}/events`).expect(200)).body;
    const created = ev.find((e: any) => e.event === 'store.created');
    expect(created).toMatchObject({ kind: 'webhook', status: 'failed', lastError: 'HTTP 500', attempts: 1 });
    failNext = 0;
    const re = (await s.call('post', `/superadmin/console/stores/${r.store.id}/events/${created.id}/redeliver`).expect(200)).body;
    expect(re).toMatchObject({ status: 'sent', attempts: 2 });
    expect(forStore(r.store.id).find((h) => h.body.event === 'store.created')!.headers['x-bmstore-delivery']).toBe(created.id);
    // another store cannot redeliver it
    const other = (await s.call('post', '/superadmin/console/intake').send({ intakeKey: uniq('wo'), businessName: `Other ${uniq()}` }).expect(200)).body;
    ids.push(other.store.id);
    await s.call('post', `/superadmin/console/stores/${other.store.id}/events/${created.id}/redeliver`).expect(404);
  });

  it('no N8N_WEBHOOK_URL: events are still recorded, status skipped, nothing sent', async () => {
    cfg.n8nWebhookUrl = undefined;
    try {
      const before = hits.length;
      const r = (await s.call('post', '/superadmin/console/intake').send({ intakeKey: uniq('ws'), businessName: `Skip ${uniq()}` }).expect(200)).body;
      ids.push(r.store.id);
      expect(hits.length).toBe(before);
      const rows = await prisma.base.outboxEvent.findMany({ where: { tenantId: r.store.id, kind: 'webhook' } });
      expect(rows.map((x) => [x.event, x.status])).toEqual([['store.created', 'skipped']]);
      const info = (await s.call('get', '/superadmin/console/webhooks').expect(200)).body;
      expect(info).toMatchObject({ configured: false, events: ['store.created', 'intake.completed', 'qa.result', 'store.live', 'renewal.due'] });
    } finally { cfg.n8nWebhookUrl = url; }
  });

  it('with BullMQ running, delivery goes through the worker', async () => {
    const sched = app.get(JobsScheduler);
    await sched.start();
    try {
      const r = (await s.call('post', '/superadmin/console/intake').send({ intakeKey: uniq('wq'), businessName: `Queued ${uniq()}` }).expect(200)).body;
      ids.push(r.store.id);
      for (let i = 0; i < 50 && !forStore(r.store.id).length; i++) await new Promise((x) => setTimeout(x, 100));
      expect(forStore(r.store.id).map((h) => h.body.event)).toEqual(['store.created']);
    } finally {
      for (const n of JOB_NAMES) await sched.queue!.removeJobScheduler(n);
      await sched.onModuleDestroy();
      (app.get(WebhookService) as any).enqueue = undefined;
    }
  });

  it('a webhook outage never breaks the action that raised it', async () => {
    cfg.n8nWebhookUrl = 'http://127.0.0.1:1/unreachable';
    try {
      const r = (await s.call('post', '/superadmin/console/intake').send({ intakeKey: uniq('wx'), businessName: `Outage ${uniq()}` }).expect(200)).body;
      ids.push(r.store.id);
      expect(r.created).toBe(true);
      const rows = await prisma.base.outboxEvent.findMany({ where: { tenantId: r.store.id, kind: 'webhook' } });
      expect(rows[0]).toMatchObject({ status: 'failed', lastError: 'network error' });
    } finally { cfg.n8nWebhookUrl = url; }
  });
});
