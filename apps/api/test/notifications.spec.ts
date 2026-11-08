/** Notification channels: interfaces with console stubs, masked logs, who gets what. */
import { INestApplication, Logger } from '@nestjs/common';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ConsoleEmailSender, ConsoleWhatsAppSender, EmailSender, maskEmail, maskPhone, WhatsAppSender } from '../src/notifications/senders';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, deleteTenants } from './helpers';
import { checkoutBody, makeStore } from './storefront-helpers';

describe('notifications', () => {
  let app: INestApplication;
  let S: Awaited<ReturnType<typeof makeStore>>;
  beforeAll(async () => { app = await createApp(); S = await makeStore(app); });
  afterAll(async () => { await deleteTenants(app.get(PrismaService).base, [S.t.id]); await app.close(); });

  it('the senders are injected through their interfaces (swap the class, callers stay)', () => {
    expect(app.get(WhatsAppSender)).toBe(app.get(ConsoleWhatsAppSender));
    expect(app.get(EmailSender)).toBe(app.get(ConsoleEmailSender));
    expect(app.get(NotificationsService)).toBeDefined();
  });

  it('logs never carry the phone, the address or the message body; only masked recipients and a kind', async () => {
    const lines: string[] = [];
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(function (this: any, msg: any) { lines.push(String(msg)); });
    try {
      const r = await S.api().post('/storefront/checkout').set('Host', S.host).send(checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '9876511111', note: 'SECRET-NOTE-XYZ', address: { ...checkoutBody([]).address, line1: '77 Hidden Lane' } })).expect(201);
      const mine = lines.filter((l) => /\[stub\]/.test(l));
      expect(mine.length).toBeGreaterThanOrEqual(2);
      for (const l of mine) {
        expect(l).not.toContain('9876511111');
        expect(l).not.toContain('SECRET-NOTE-XYZ');
        expect(l).not.toContain('Hidden Lane');
        expect(l).not.toContain('meena@example.com');
      }
      expect(mine.some((l) => l.includes('customer.order_confirmation -> 98******11'))).toBe(true);
      expect(mine.some((l) => l.includes('owner.new_order -> 91********10'))).toBe(true);
      // the messages themselves do carry the detail the owner needs
      const wa = app.get(ConsoleWhatsAppSender);
      const alert = [...wa.outbox].reverse().find((m) => m.kind === 'owner.new_order')!;
      expect(alert.text).toContain(r.body.orderNo);
      expect(alert.text).toContain('77 Hidden Lane');
      expect(alert.text).toContain('SECRET-NOTE-XYZ');
      expect(alert.text).toContain('9876511111');
      const conf = [...wa.outbox].reverse().find((m) => m.kind === 'customer.order_confirmation')!;
      expect(conf.to).toBe('9876511111');
      expect(conf.text).toMatch(/Track it: http:\/\/.*\/order\/.*\?t=/);
      expect(conf.text).toMatch(/Invoice: http:\/\/.*\/invoice\?t=/);
    } finally { spy.mockRestore(); }
  });

  it('masking helpers', () => {
    expect(maskPhone('9876543210')).toBe('98******10');
    expect(maskPhone('919876543210')).toBe('91********10');
    expect(maskEmail('owner@demo.test')).toBe('ow***@demo.test');
  });

  it('a failing channel never breaks checkout', async () => {
    const wa = app.get(ConsoleWhatsAppSender);
    const orig = wa.send.bind(wa);
    wa.send = async () => { throw new Error('gateway down'); };
    try {
      await S.api().post('/storefront/checkout').set('Host', S.host).send(checkoutBody([{ productId: S.plain.id, qty: 1 }], { phone: '9876522222' })).expect(201);
    } finally { wa.send = orig; }
  });
});
