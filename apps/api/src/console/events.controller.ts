import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthActor } from '../common/request-context';
import { AppConfig } from '../config/app-config';
import { ConsoleScope } from './console-scope';
import { WEBHOOK_EVENTS, WebhookService } from './webhooks';

/** Console: a store's notifications + webhooks, and redelivery of a webhook. */
@Roles('superadmin')
@Controller('superadmin/console')
export class EventsController {
  constructor(private readonly webhooks: WebhookService, private readonly scope: ConsoleScope, private readonly cfg: AppConfig) {}

  @Get('webhooks') info() { return { configured: Boolean(this.cfg.n8nWebhookUrl), signed: Boolean(this.cfg.webhookSecret), events: WEBHOOK_EVENTS }; }

  @Get('stores/:id/events')
  async list(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    await this.scope.tenant(a, id);
    return this.webhooks.list(id);
  }

  @Post('stores/:id/events/:eventId/redeliver') @HttpCode(200)
  async redeliver(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Param('eventId', ParseUUIDPipe) eventId: string) {
    await this.scope.tenant(a, id);
    const r = await this.webhooks.deliver(eventId, id);
    await this.scope.audit(a.id, id, 'console.webhook_redelivered', { event: r.event, status: r.status });
    return r;
  }
}
