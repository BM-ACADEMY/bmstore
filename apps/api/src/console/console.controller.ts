import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthActor } from '../common/request-context';
import { PolicyService } from './policy.service';

export class GeneratePoliciesDto {
  @IsOptional() @IsBoolean() overwrite?: boolean;
}

/** Developer console API (platform host, superadmin only). Every store-level action runs in that store's tenant scope. */
@Roles('superadmin')
@Controller('superadmin/console')
export class ConsoleController {
  constructor(private readonly policies: PolicyService) {}

  @Get('stores/:id/policies/preview')
  previewPolicies(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.policies.preview(actor, id);
  }

  @Post('stores/:id/policies') @HttpCode(200)
  generatePolicies(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GeneratePoliciesDto) {
    return this.policies.generate(actor, id, dto.overwrite ?? true);
  }
}
