import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ConsoleEmailSender, ConsoleWhatsAppSender, EmailSender, WhatsAppSender } from './senders';

/** Swap the two `useClass` lines for real transports (WhatsApp Cloud API, SES/SMTP). */
@Global()
@Module({
  providers: [
    ConsoleWhatsAppSender, ConsoleEmailSender,
    { provide: WhatsAppSender, useExisting: ConsoleWhatsAppSender },
    { provide: EmailSender, useExisting: ConsoleEmailSender },
    NotificationsService,
  ],
  exports: [NotificationsService, WhatsAppSender, EmailSender, ConsoleWhatsAppSender, ConsoleEmailSender],
})
export class NotificationsModule {}
