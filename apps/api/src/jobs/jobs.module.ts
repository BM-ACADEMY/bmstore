import { Controller, Get, HttpCode, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Roles } from '../auth/decorators';
import { ConsoleModule } from '../console/console.module';
import { JobsScheduler, SCHEDULE } from './jobs.scheduler';
import { JOB_NAMES, JobName, JobsService } from './jobs.service';

const JOB_ENUM = Object.fromEntries(JOB_NAMES.map((n) => [n, n]));

/** Console: see when each job last ran, run one now. */
@Roles('superadmin')
@Controller('superadmin/console/jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}
  @Get() async list() {
    const last = await this.jobs.lastRuns();
    return last.map((r) => ({ ...r, schedule: SCHEDULE[r.job], timezone: 'Asia/Kolkata' }));
  }
  @Post(':name/run') @HttpCode(200) run(@Param('name', new ParseEnumPipe(JOB_ENUM)) name: JobName) { return this.jobs.run(name); }
}

@Module({ imports: [ConsoleModule], controllers: [JobsController], providers: [JobsService, JobsScheduler], exports: [JobsService, JobsScheduler] })
export class JobsModule {}
