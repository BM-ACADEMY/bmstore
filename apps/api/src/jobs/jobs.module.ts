import { Controller, Get, HttpCode, Module, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { ConsoleModule } from '../console/console.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { JobsScheduler, SCHEDULE } from './jobs.scheduler';
import { JobsService } from './jobs.service';
import { JOB_NAMES, JobName, PlatformJobsService } from './platform-jobs.service';

const JOB_ENUM = Object.fromEntries(JOB_NAMES.map((n) => [n, n]));

/** Console: see when each platform job last ran, run one now. */
@Roles('superadmin')
@Controller('superadmin/console/jobs')
export class JobsController {
  constructor(private readonly jobs: PlatformJobsService) {}
  @Get() async list() {
    const last = await this.jobs.lastRuns();
    return last.map((r) => ({ ...r, schedule: SCHEDULE[r.job], timezone: 'Asia/Kolkata' }));
  }
  @Post(':name/run') @HttpCode(200) run(@Param('name', new ParseEnumPipe(JOB_ENUM)) name: JobName) { return this.jobs.run(name); }
}

/**
 * Two kinds of background work:
 *  - JobsService (storefront, S3): per-store order housekeeping on a timer (unpaid-order expiry, owner weekly summary);
 *  - PlatformJobsService + JobsScheduler (console, S5): BullMQ schedules for the developer (intake chasers, renewals,
 *    expiry, backup check, usage warnings, developer weekly summary) and webhook delivery.
 */
@Module({
  imports: [StorefrontModule, ConsoleModule],
  controllers: [JobsController],
  providers: [JobsService, PlatformJobsService, JobsScheduler],
  exports: [JobsService, PlatformJobsService, JobsScheduler],
})
export class JobsModule {}
