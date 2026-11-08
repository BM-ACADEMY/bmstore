import { Module } from '@nestjs/common';
import { ConsoleController } from './console.controller';
import { ConsoleScope } from './console-scope';
import { PolicyService } from './policy.service';

@Module({ controllers: [ConsoleController], providers: [ConsoleScope, PolicyService], exports: [ConsoleScope, PolicyService] })
export class ConsoleModule {}
