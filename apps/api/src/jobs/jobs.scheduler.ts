import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { AppConfig } from '../config/app-config';
import { JOB_NAMES, JobName, PlatformJobsService } from './platform-jobs.service';
import { MAX_WEBHOOK_ATTEMPTS, WebhookService } from '../console/webhooks';

export const QUEUE = 'bmstore-jobs';
const TZ = 'Asia/Kolkata';

/** When each job runs (India time). Minutes off the hour on purpose. */
export const SCHEDULE: Record<JobName, string> = {
  'intake-chasers': '7 10 * * *', // 10:07 daily
  'renewal-reminders': '17 10 * * *', // 10:17 daily
  'expiry-suspend': '3 * * * *', // hourly
  'backup-check': '23 7 * * *', // 07:23 daily (backups run overnight)
  'usage-warnings': '37 11 * * *', // 11:37 daily
  'weekly-summary': '13 9 * * 1', // Monday 09:13
};

/** BullMQ wants plain connection options (it bundles its own ioredis). Never logged: may carry a password. */
export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname, port: Number(u.port || 6379), username: u.username || undefined, password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number(u.pathname.replace('/', '') || 0), maxRetriesPerRequest: null, ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/**
 * Registers the repeatable schedules and runs the worker inside the API process when JOBS_WORKER=1 (default outside
 * tests). Several API processes are fine: BullMQ hands each scheduled run to one worker, and every job is idempotent.
 * Extra job names (e.g. webhook delivery) are routed through `handlers`.
 */
@Injectable()
export class JobsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('JobsScheduler');
  queue?: Queue;
  private worker?: Worker;
  readonly handlers = new Map<string, (data: any) => Promise<unknown>>();

  constructor(private readonly cfg: AppConfig, private readonly jobs: PlatformJobsService, private readonly webhooks: WebhookService) {}

  async onModuleInit() {
    if (!this.cfg.platformJobsEnabled) return;
    await this.start();
  }

  async start() {
    const connection = redisConnection(this.cfg.redisUrl);
    this.queue = new Queue(QUEUE, { connection, defaultJobOptions: { removeOnComplete: 200, removeOnFail: 500 } });
    for (const name of JOB_NAMES) {
      await this.queue.upsertJobScheduler(name, { pattern: SCHEDULE[name], tz: TZ }, { name, data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } } });
    }
    // Webhook delivery on the worker: retried with exponential backoff (1 min, 2, 4, 8, 16), then left "failed".
    this.handlers.set('deliver-webhook', (d: { eventId: string; tenantId: string }) => this.webhooks.deliver(d.eventId, d.tenantId, true));
    const q = this.queue;
    this.webhooks.useQueue(async (eventId, tenantId) => {
      await q.add('deliver-webhook', { eventId, tenantId }, { jobId: `wh-${eventId}`, attempts: MAX_WEBHOOK_ATTEMPTS, backoff: { type: 'exponential', delay: 60_000 } });
    });
    this.worker = new Worker(QUEUE, (job: Job) => this.process(job), { connection, concurrency: 2 });
    this.worker.on('failed', (job, err) => this.log.error(`job ${job?.name} failed: ${err?.message?.slice(0, 200)}`));
    this.log.log(`scheduled ${JOB_NAMES.length} jobs (${TZ})`);
  }

  async process(job: Job) {
    if ((JOB_NAMES as readonly string[]).includes(job.name)) return this.jobs.run(job.name as JobName);
    const h = this.handlers.get(job.name);
    if (!h) throw new Error(`No handler for job ${job.name}`);
    return h(job.data);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
