import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthActor } from '../common/request-context';
import { QA_CHECKS, QaService } from './qa.service';
import { StorefrontProbe } from './qa-probes';

@Roles('superadmin')
@Controller('superadmin/console')
export class QaController {
  constructor(private readonly qa: QaService, private readonly storefront: StorefrontProbe) {}

  @Get('qa/checks')
  checks() { return { checks: QA_CHECKS, storefrontAvailable: this.storefront.available }; }

  @Post('stores/:id/qa') @HttpCode(200)
  run(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) { return this.qa.run(actor, id); }

  @Get('stores/:id/qa')
  async history(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return { runs: await this.qa.history(actor, id) };
  }
}
