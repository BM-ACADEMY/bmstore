import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import type { AuthActor } from '../common/request-context';
import { REFUND_REASONS, RefundReason } from './refund-rule';
import { RefundService } from './refund.service';
import { STAGES } from './stage';
import { StoresService } from './stores.service';

export class ListStoresQuery {
  @IsOptional() @IsIn(STAGES.map((s) => s.id)) stage?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
export class ReasonBody { @IsOptional() @IsString() @MaxLength(500) reason?: string }
export class ImpersonateBody { @IsString() @MinLength(5) @MaxLength(500) reason!: string }
export class ExtendBody {
  @Type(() => Number) @IsInt() @Min(1) @Max(1100) days!: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class RefundBody {
  @IsIn(REFUND_REASONS) reason!: RefundReason;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsInt() @Min(0) @Max(365) clientDelayWorkingDays?: number;
  @IsOptional() @IsString() @MaxLength(1000) clientDelayNote?: string;
  @IsInt() @Min(1) @Max(100_000_000) amountPaidPaise!: number;
  @IsInt() @Min(0) @Max(100_000_000) gstPaise!: number;
  @IsOptional() @Matches(/^pay_[A-Za-z0-9]+$/, { message: 'Payment id must look like pay_XXXXXXXX' }) paymentId?: string;
  @IsOptional() @IsString() @MaxLength(100) invoiceRef?: string;
}
export class ApproveRefundBody { @IsInt() @Min(1) confirmPaise!: number }
export class RejectRefundBody { @IsString() @MinLength(3) @MaxLength(1000) note!: string }
export class RedeemBody { @IsString() @MinLength(20) @MaxLength(100) code!: string }

/** Developer console: stores, lifecycle, renewals, usage, refunds, needs-attention. Superadmin only. */
@Roles('superadmin')
@Controller('superadmin/console')
export class StoresController {
  constructor(private readonly stores: StoresService, private readonly refunds: RefundService) {}

  @Get('attention') attention(@CurrentUser() a: AuthActor) { return this.stores.attention(a); }
  @Get('stores') list(@CurrentUser() a: AuthActor, @Query() q: ListStoresQuery) { return this.stores.list(a, q); }
  @Get('renewals') renewals(@CurrentUser() a: AuthActor) { return this.stores.renewals(a); }
  @Get('usage') usage(@CurrentUser() a: AuthActor) { return this.stores.usage(a); }
  @Get('refunds') allRefunds(@CurrentUser() a: AuthActor) { return this.refunds.all(a); }

  @Get('stores/:id') detail(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) { return this.stores.detail(a, id); }
  @Post('stores/:id/go-live') @HttpCode(200) goLive(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) { return this.stores.goLive(a, id); }
  @Post('stores/:id/suspend') @HttpCode(200) suspend(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() b: ReasonBody) { return this.stores.suspend(a, id, b.reason); }
  @Post('stores/:id/unsuspend') @HttpCode(200) unsuspend(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() b: ReasonBody) { return this.stores.unsuspend(a, id, b.reason); }
  @Post('stores/:id/extend') @HttpCode(200) extend(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() b: ExtendBody) { return this.stores.extend(a, id, b.days, b.reason); }
  @Post('stores/:id/impersonate') @HttpCode(200) impersonate(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() b: ImpersonateBody) { return this.stores.impersonate(a, id, b.reason); }

  @Get('stores/:id/refunds') refundList(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string) { return this.refunds.list(a, id); }
  @Post('stores/:id/refunds/preview') @HttpCode(200) refundPreview(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() b: RefundBody) { return this.refunds.preview(a, id, b); }
  @Post('stores/:id/refunds') openRefund(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Body() b: RefundBody) { return this.refunds.open(a, id, b); }
  @Post('stores/:id/refunds/:caseId/approve') @HttpCode(200)
  approveRefund(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Param('caseId', ParseUUIDPipe) caseId: string, @Body() b: ApproveRefundBody) { return this.refunds.approve(a, id, caseId, b.confirmPaise); }
  @Post('stores/:id/refunds/:caseId/reject') @HttpCode(200)
  rejectRefund(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Param('caseId', ParseUUIDPipe) caseId: string, @Body() b: RejectRefundBody) { return this.refunds.reject(a, id, caseId, b.note); }
  @Get('stores/:id/refunds/:caseId/credit-note') @Header('Content-Type', 'text/html; charset=utf-8')
  creditNote(@CurrentUser() a: AuthActor, @Param('id', ParseUUIDPipe) id: string, @Param('caseId', ParseUUIDPipe) caseId: string) { return this.refunds.creditNoteHtml(a, id, caseId); }
}

/** Store host: the admin app redeems the one-time impersonation code here. */
@Controller('auth/impersonate')
export class ImpersonationRedeemController {
  constructor(private readonly stores: StoresService) {}
  @Public() @Post() @HttpCode(200) redeem(@Body() b: RedeemBody) { return this.stores.redeemImpersonation(b.code); }
}
