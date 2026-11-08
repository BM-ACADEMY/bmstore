/**
 * Send (or preview) the weekly owner summary now, for every store or one slug:
 *   npm run jobs:weekly                 # all stores, through the stub senders (logs)
 *   DEMO_SLUG=demo npm run jobs:weekly  # one store, prints the summary numbers
 * Use from cron if you prefer not to rely on the in-process scheduler (JOBS_ENABLED=0 on the API then).
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { JobsService } from '../src/jobs/jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  try {
    const jobs = app.get(JobsService);
    const prisma = app.get(PrismaService);
    const slug = process.env.DEMO_SLUG;
    if (slug) {
      const t = await prisma.base.tenant.findUniqueOrThrow({ where: { slug } });
      const s = await prisma.runAsTenant(t.id, () => jobs.summarize());
      console.log(JSON.stringify({ store: t.name, ...s }, null, 2));
      await prisma.runAsTenant(t.id, () => app.get((require('../src/notifications/notifications.service') as typeof import('../src/notifications/notifications.service')).NotificationsService).weeklySummary(s, t.name));
    } else {
      console.log(`weekly summary sent to ${await jobs.weeklySummaries(new Date(), true)} store(s)`);
    }
  } finally { await app.close(); }
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
