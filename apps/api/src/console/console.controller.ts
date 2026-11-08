import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthActor } from '../common/request-context';
import { PolicyService } from './policy.service';
import { IntakeService } from './intake.service';
import { LAYOUTS } from './layouts';
import { REQUIRED_FIELDS, RAZORPAY_STATUSES } from './intake';

export class GeneratePoliciesDto {
  @IsOptional() @IsBoolean() overwrite?: boolean;
}

/** Developer console API (platform host, superadmin only). Every store-level action runs in that store's tenant scope. */
@Roles('superadmin')
@Controller('superadmin/console')
export class ConsoleController {
  constructor(private readonly policies: PolicyService, private readonly intakes: IntakeService) {}

  /** Static choices for the console forms. */
  @Get('options')
  options() {
    return {
      layouts: Object.entries(LAYOUTS).map(([id, l]) => ({ id, label: l.label, description: l.description, primaryColor: l.primaryColor, secondaryColor: l.secondaryColor })),
      razorpayStatuses: RAZORPAY_STATUSES,
      requiredFields: REQUIRED_FIELDS.map((f) => f.label),
    };
  }

  /** Create store from intake. JSON or form body. Idempotent on intakeKey (or business name + email). */
  @Post('intake') @HttpCode(200)
  createFromIntake(@CurrentUser() actor: AuthActor, @Body() body: Record<string, any>) {
    return this.intakes.createFromIntake(actor, body);
  }

  @Get('stores/:id/intake')
  getIntake(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.intakes.get(actor, id);
  }

  @Patch('stores/:id/intake')
  updateIntake(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, any>) {
    return this.intakes.update(actor, id, body);
  }

  @Get('stores/:id/policies/preview')
  previewPolicies(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.policies.preview(actor, id);
  }

  @Post('stores/:id/policies') @HttpCode(200)
  generatePolicies(@CurrentUser() actor: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GeneratePoliciesDto) {
    return this.policies.generate(actor, id, dto.overwrite ?? true);
  }
}
