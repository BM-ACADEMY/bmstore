import { INestApplication } from '@nestjs/common';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppConfig } from '../src/config/app-config';
import { JobsScheduler, redisConnection, SCHEDULE } from '../src/jobs/jobs.scheduler';
import { JOB_NAMES, JobsService } from '../src/jobs/jobs.service';
import { StubNotifier } from '../src/notify/notifier';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, deleteTenants, uniq } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

const DAY = 86_400_000;

describe('scheduled jobs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jobs: JobsService;
  let notifier: StubNotifier;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const ids: string[] = [];
  const outbox = (tid: string, event?: string) => prisma.base.outboxEvent.findMany({ where: { tenantId: tid, ...(event ? { event } : {}) }, orderBy: { createdAt: 'asc' } });

  async function intake(body: Record<string, unknown>) {
    const r = (await s.call('post', '/superadmin/console/intake').send({ intakeKey: uniq('job'), ...body }).expect(200)).body;
    ids.push(r.store.id);
    return r.store.id as string;
  }

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    jobs = app.get(JobsService);
    notifier = app.get(StubNotifier);
    s = await superadminSession(app);
  });
  afterAll(async () => {
    await deleteTenants(prisma.base, ids);
    await cleanupSuperadmin(app, s.id);
    await app.close();
  });

  it('intake chasers on day 2, 4, 7 (each once, even if the job runs twice); parked on day 14 with a storefront notice', async () => {
    const wa = `98${Date.now().toString().slice(-8)}`;
    const tid = await intake({ businessName: `Chase ${uniq()}`, whatsapp: wa, ownerName: 'Ravi' });
    const received = (await prisma.base.storeIntake.findUniqueOrThrow({ where: { tenantId: tid } })).receivedAt;
    const at = (d: number) => new Date(received.getTime() + d * DAY + 60_000);

    await jobs.intakeChasers(at(1));
    expect(await outbox(tid, 'intake.chaser')).toHaveLength(0);
    await jobs.intakeChasers(at(2));
    await jobs.intakeChasers(at(2)); // re-run: no duplicate
    expect(await outbox(tid, 'intake.chaser')).toHaveLength(1);
    await jobs.intakeChasers(at(5));
    await jobs.intakeChasers(at(8));
    const ch = await outbox(tid, 'intake.chaser');
    expect(ch.map((e) => (e.payload as any).chaser)).toEqual([1, 2, 3]);
    expect(ch.every((e) => e.status === 'stubbed' && e.kind === 'notice')).toBe(true);
    expect(notifier.sentTo(wa).map((m) => m.template)).toEqual(['intake_chaser_1', 'intake_chaser_2', 'intake_chaser_3']);
    expect((await prisma.base.storeIntake.findUniqueOrThrow({ where: { tenantId: tid } })).chasersSent).toBe(3);

    await jobs.intakeChasers(at(14));
    const t = await prisma.base.tenant.findUniqueOrThrow({ where: { id: tid } });
    expect(t.status).toBe('PARKED');
    expect(await outbox(tid, 'intake.parked')).toHaveLength(1);
    const res = await request(app.getHttpServer()).get('/health').set('Host', `${t.subdomain}.localhost`).expect(403);
    expect(res.body).toMatchObject({ message: 'Store parked', code: 'store_parked', notice: { title: `${t.name} is not open yet`, whatsapp: wa } });

    // complete intakes are never chased
    const done = await intake({ businessName: `Done ${uniq()}`, ownerName: 'O', whatsapp: '9811111111', email: `${uniq()}@j.test`, category: 'x', logoUrl: 'x', brandColors: ['#111111'], productSheet: 'p', address: 'a', razorpayStatus: 'not_needed', shipping: { mode: 'FREE' }, cod: { enabled: true }, aboutText: 'a' });
    await jobs.intakeChasers(new Date(Date.now() + 9 * DAY));
    expect(await outbox(done, 'intake.chaser')).toHaveLength(0);
  });

  it('renewal reminders on plan day 305 and 335, once each per plan period; renewal.due raised', async () => {
    const tid = await intake({ businessName: `Renew ${uniq()}`, whatsapp: '9822222222' });
    const live = new Date(Date.now() - 306 * DAY);
    await prisma.base.tenant.update({ where: { id: tid }, data: { status: 'LIVE', wentLiveAt: live, expiresAt: new Date(live.getTime() + 365 * DAY) } });
    await jobs.renewalReminders(new Date(live.getTime() + 300 * DAY));
    expect(await outbox(tid, 'renewal.reminder')).toHaveLength(0);
    await jobs.renewalReminders(new Date(live.getTime() + 305 * DAY + 1000));
    await jobs.renewalReminders(new Date(live.getTime() + 306 * DAY));
    expect((await outbox(tid, 'renewal.reminder')).map((e) => (e.payload as any).milestone)).toEqual([305]);
    await jobs.renewalReminders(new Date(live.getTime() + 336 * DAY));
    expect((await outbox(tid, 'renewal.reminder')).map((e) => (e.payload as any).milestone)).toEqual([305, 335]);
  });

  it('expiry: a LIVE store past its expiry is suspended and visitors get the expired notice; extend brings it back', async () => {
    const tid = await intake({ businessName: `Expire ${uniq()}`, whatsapp: '9833333333' });
    await prisma.base.tenant.update({ where: { id: tid }, data: { status: 'LIVE', wentLiveAt: new Date(Date.now() - 400 * DAY), expiresAt: new Date(Date.now() - 1000) } });
    const r = await jobs.expirySuspend(new Date());
    expect(r.details.suspended).toContain(tid);
    const t = await prisma.base.tenant.findUniqueOrThrow({ where: { id: tid } });
    expect(t.status).toBe('SUSPENDED');
    const res = await request(app.getHttpServer()).get('/health').set('Host', `${t.subdomain}.localhost`).expect(403);
    expect(res.body.notice).toMatchObject({ code: 'store_suspended' });
    expect(await outbox(tid, 'store.expired')).toHaveLength(1);
    await jobs.expirySuspend(new Date());
    expect(await outbox(tid, 'store.expired')).toHaveLength(1);
    await s.call('post', `/superadmin/console/stores/${tid}/extend`).send({ days: 365 }).expect(200);
    await request(app.getHttpServer()).get('/health').set('Host', `${t.subdomain}.localhost`).expect(200);
  });

  it('an expired LIVE store that the job has not reached yet still shows the expired notice', async () => {
    const tid = await intake({ businessName: `Lapsed ${uniq()}` });
    const t = await prisma.base.tenant.update({ where: { id: tid }, data: { status: 'LIVE', expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app.getHttpServer()).get('/health').set('Host', `${t.subdomain}.localhost`).expect(403);
    expect(res.body).toMatchObject({ message: 'Store subscription expired', code: 'store_expired', notice: { code: 'store_expired' } });
  });

  it('nightly backup check reads infra/backup state: ok / stale / failed / missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bm-state-'));
    const cfg = app.get(AppConfig) as any;
    const orig = cfg.backupStateDir;
    cfg.backupStateDir = dir;
    try {
      expect((await jobs.backupCheck(new Date())).details.status).toBe('missing');
      writeFileSync(join(dir, 'backup.nightly.last'), `OK ${new Date(Date.now() - 3 * 3_600_000).toISOString()} size=1M seconds=20 file=x.age\n`);
      expect((await jobs.backupCheck(new Date())).details.status).toBe('ok');
      writeFileSync(join(dir, 'backup.nightly.last'), `OK ${new Date(Date.now() - 30 * 3_600_000).toISOString()}\n`);
      expect((await jobs.backupCheck(new Date())).details.status).toBe('stale');
      writeFileSync(join(dir, 'backup.nightly.last'), `FAIL ${new Date().toISOString()}\n`);
      expect((await jobs.backupCheck(new Date())).details.status).toBe('failed');
      expect(notifier.outbox.some((m) => m.template === 'dev_backup_problem')).toBe(true);
    } finally { cfg.backupStateDir = orig; }
  });

  it('usage warnings at 80% / 95%, once per month per level', async () => {
    const tid = await intake({ businessName: `Heavy ${uniq()}`, whatsapp: '9844444444' });
    await prisma.base.tenantUsage.upsert({ where: { tenantId: tid }, create: { tenantId: tid, productCount: 1700 }, update: { productCount: 1700 } });
    await jobs.usageWarnings(new Date());
    await jobs.usageWarnings(new Date());
    expect((await outbox(tid, 'usage.warning')).map((e) => (e.payload as any).level)).toEqual([80]);
    await prisma.base.tenantUsage.update({ where: { tenantId: tid }, data: { productCount: 1990 } });
    await jobs.usageWarnings(new Date());
    expect((await outbox(tid, 'usage.warning')).map((e) => (e.payload as any).level)).toEqual([80, 95]);
  });

  it('weekly summary goes to the developer; console lists jobs and can run one', async () => {
    const before = notifier.outbox.length;
    const r = (await s.call('post', '/superadmin/console/jobs/weekly-summary/run').expect(200)).body;
    expect(r.summary).toMatch(/^sent/);
    const m = notifier.outbox.slice(before).find((x) => x.template === 'dev_weekly_summary')!;
    expect(m.text).toContain('Intake received:');
    expect(m.text).not.toMatch(/rating|testimonial|customer review/i); // ("Review" is a pipeline stage, not social proof)
    const list = (await s.call('get', '/superadmin/console/jobs').expect(200)).body;
    expect(list.map((j: any) => j.job)).toEqual([...JOB_NAMES]);
    expect(list.find((j: any) => j.job === 'weekly-summary').at).toBeTruthy();
    await s.call('post', '/superadmin/console/jobs/nope/run').expect(400);
  });

  it('BullMQ: registers one repeatable schedule per job (India time) and processes a run through the worker', async () => {
    const sched = app.get(JobsScheduler);
    expect(redisConnection('redis://:p%40ss@h:6380/15')).toMatchObject({ host: 'h', port: 6380, password: 'p@ss', db: 15, maxRetriesPerRequest: null });
    await sched.start();
    try {
      const js = await sched.queue!.getJobSchedulers();
      expect(js.map((j) => j.key).sort()).toEqual([...JOB_NAMES].sort());
      expect(js.every((j) => j.tz === 'Asia/Kolkata' && j.pattern === SCHEDULE[j.key as keyof typeof SCHEDULE])).toBe(true);
      const r: any = await sched.process({ name: 'backup-check', data: {} } as any);
      expect(r.job).toBe('backup-check');
    } finally {
      for (const n of JOB_NAMES) await sched.queue!.removeJobScheduler(n);
      await sched.onModuleDestroy();
    }
  });
});
