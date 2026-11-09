import { Module } from '@nestjs/common';
import { StorefrontModule } from '../storefront/storefront.module';
import { JobsService } from './jobs.service';

@Module({ imports: [StorefrontModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
