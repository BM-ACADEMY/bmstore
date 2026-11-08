import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuperadminModule } from '../superadmin/superadmin.module';
import { ConsoleController } from './console.controller';
import { ConsoleScope } from './console-scope';
import { ConsoleEvents } from './events';
import { IntakeService } from './intake.service';
import { PolicyService } from './policy.service';

@Module({
  imports: [AuthModule, SuperadminModule],
  controllers: [ConsoleController],
  providers: [ConsoleScope, PolicyService, IntakeService, ConsoleEvents],
  exports: [ConsoleScope, PolicyService, IntakeService, ConsoleEvents],
})
export class ConsoleModule {}
