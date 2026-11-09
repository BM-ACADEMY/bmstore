import { Injectable, Logger } from '@nestjs/common';

/**
 * Outbound channels behind interfaces. Both are STUBS: they log a masked line (never the body: it holds names,
 * addresses and amounts) and keep a bounded in-memory outbox for tests. Swap the provider class in
 * notifications.module.ts for the WhatsApp Cloud API / an SMTP or SES transport; callers never change.
 */
export interface WhatsAppMessage { to: string; text: string; kind: string }
export interface EmailMessage { to: string; subject: string; text: string; kind: string; attachments?: Array<{ filename: string; content: Buffer; contentType: string }> }

export abstract class WhatsAppSender { abstract send(m: WhatsAppMessage): Promise<void>; }
export abstract class EmailSender { abstract send(m: EmailMessage): Promise<void>; }

const LIMIT = 500;
export const maskPhone = (p: string) => (p.length > 4 ? `${p.slice(0, 2)}${'*'.repeat(Math.max(0, p.length - 4))}${p.slice(-2)}` : '****');
export const maskEmail = (e: string) => { const [u, d] = e.split('@'); return `${u?.slice(0, 2) ?? ''}***@${d ?? ''}`; };

@Injectable()
export class ConsoleWhatsAppSender extends WhatsAppSender {
  private readonly log = new Logger('WhatsApp');
  readonly outbox: WhatsAppMessage[] = [];
  async send(m: WhatsAppMessage) {
    this.outbox.push(m);
    if (this.outbox.length > LIMIT) this.outbox.splice(0, this.outbox.length - LIMIT);
    this.log.log(`[stub] ${m.kind} -> ${maskPhone(m.to)} (${m.text.length} chars)`);
  }
}
@Injectable()
export class ConsoleEmailSender extends EmailSender {
  private readonly log = new Logger('Email');
  readonly outbox: EmailMessage[] = [];
  async send(m: EmailMessage) {
    this.outbox.push(m);
    if (this.outbox.length > LIMIT) this.outbox.splice(0, this.outbox.length - LIMIT);
    this.log.log(`[stub] ${m.kind} -> ${maskEmail(m.to)} subject="${m.subject}"${m.attachments?.length ? ` +${m.attachments.length} attachment(s)` : ''}`);
  }
}
