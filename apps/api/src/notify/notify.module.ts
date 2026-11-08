import { Global, Module } from '@nestjs/common';
import { Notifier, StubNotifier } from './notifier';

@Global()
@Module({ providers: [StubNotifier, { provide: Notifier, useExisting: StubNotifier }], exports: [Notifier, StubNotifier] })
export class NotifyModule {}
