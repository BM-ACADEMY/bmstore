import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Post, Query, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators';
import { ThrottleService } from '../auth/throttle.service';
import { ClientIp } from '../common/client-ip';
import { RequestContext } from '../common/request-context';
import { AppConfig } from '../config/app-config';
import { CheckoutDto, LookupQuery, OtpSendDto, OtpVerifyDto, QuoteDto, VerifyPaymentDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';
import { normalizePhone } from './india';
import { OtpService } from './otp';
import { PaymentsService } from './payments.service';

/** Public checkout surface. Rate-limited per IP (and per phone for OTP); tenant comes from the Host like every route. */
@Public()
@Controller('storefront')
export class StorefrontCheckoutController {
  constructor(private readonly checkout: CheckoutService, private readonly payments: PaymentsService, private readonly otp: OtpService, private readonly throttle: ThrottleService, private readonly cfg: AppConfig) {}

  @Post('quote') @HttpCode(200)
  quote(@Body() dto: QuoteDto) { return this.checkout.quote(dto); }

  @Post('checkout') @HttpCode(201)
  async place(@Body() dto: CheckoutDto, @ClientIp() ip: string, @Req() req: Request) {
    await this.throttle.assertLimit('checkout:ip', ip, this.cfg.checkoutIpLimit, this.cfg.checkoutWindowSec);
    return this.checkout.place(dto, req.hostname);
  }

  @Post('otp/send') @HttpCode(200)
  async otpSend(@Body() dto: OtpSendDto, @ClientIp() ip: string) {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
    await this.throttle.assertLimit('otp:ip', ip, this.cfg.otpIpLimit, this.cfg.otpWindowSec);
    await this.throttle.assertLimit('otp:phone', `${RequestContext.tenantId()}:${phone}`, this.cfg.otpPhoneLimit, this.cfg.otpWindowSec);
    return this.otp.send(phone, RequestContext.get()?.tenant?.name ?? 'the store');
  }

  @Post('otp/verify') @HttpCode(200)
  async otpVerify(@Body() dto: OtpVerifyDto, @ClientIp() ip: string) {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
    await this.throttle.assertLimit('otp:verify:ip', ip, this.cfg.otpIpLimit * 2, this.cfg.otpWindowSec);
    return this.otp.verify(phone, dto.code);
  }

  /** Order status page: order number + phone (or the token issued at checkout). */
  @Get('orders/lookup')
  async lookup(@Query() q: LookupQuery, @ClientIp() ip: string, @Req() req: Request) {
    await this.throttle.assertLimit('lookup:ip', ip, this.cfg.lookupIpLimit, this.cfg.lookupWindowSec);
    return this.checkout.lookup(q.orderNo, { phone: q.phone, token: q.token }, req.hostname);
  }

  @Post('payments/razorpay/verify') @HttpCode(200)
  async verify(@Body() dto: VerifyPaymentDto, @ClientIp() ip: string, @Req() req: Request) {
    await this.throttle.assertLimit('verify:ip', ip, this.cfg.checkoutIpLimit * 3, this.cfg.checkoutWindowSec);
    return this.payments.verify(dto, req.hostname);
  }

  /** Razorpay -> https://<store host>/api/storefront/payments/razorpay/webhook (Caddy strips /api). Raw body needed for the signature. */
  @Post('payments/razorpay/webhook') @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string, @Headers('x-razorpay-event-id') eventId?: string) {
    const raw = req.rawBody ?? (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {})));
    return this.payments.webhook(raw, signature, eventId);
  }
}
