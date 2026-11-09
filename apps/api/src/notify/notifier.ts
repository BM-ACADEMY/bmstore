import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type Channel = 'whatsapp' | 'email';

export interface Notice {
  channel: Channel;
  to: string;
  /** Stable template id (WhatsApp Business templates are pre-approved by id). */
  template: string;
  /** Rendered text (kept for the stub outbox / email body). Never put secrets or passwords here. */
  text: string;
  tenantId?: string | null;
}

export interface Delivery { delivered: boolean; transport: string; id: string; detail?: string }

/**
 * Outbound notifications (WhatsApp + email) to store owners and to the developer.
 * STUB: no provider is wired yet. Replace StubNotifier with a WhatsApp Business API / SES implementation; callers
 * (QA owner alert, chasers, renewals, usage warnings, weekly summary) do not change.
 */
export abstract class Notifier {
  abstract send(n: Notice): Promise<Delivery>;
}

@Injectable()
export class StubNotifier extends Notifier {
  private readonly log = new Logger('Notifier');
  static readonly LIMIT = 500;
  readonly outbox: Array<Notice & { id: string; at: Date }> = [];

  async send(n: Notice): Promise<Delivery> {
    const id = randomUUID();
    this.outbox.push({ ...n, id, at: new Date() });
    if (this.outbox.length > StubNotifier.LIMIT) this.outbox.splice(0, this.outbox.length - StubNotifier.LIMIT);
    this.log.log(`notice (stub transport) channel=${n.channel} to=${mask(n.to)} template=${n.template}`); // body never logged
    return { delivered: true, transport: 'stub', id };
  }

  sentTo(to: string, template?: string) {
    return this.outbox.filter((m) => m.to === to && (!template || m.template === template));
  }
}

export function mask(to: string) {
  if (to.includes('@')) { const [u, d] = to.split('@'); return `${u.slice(0, 2)}***@${d}`; }
  return to.length > 4 ? `${'*'.repeat(Math.max(0, to.length - 4))}${to.slice(-4)}` : '****';
}
