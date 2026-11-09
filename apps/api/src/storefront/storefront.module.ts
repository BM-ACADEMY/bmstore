import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '../crypto/crypto.module';
import { StorefrontCatalogController } from './catalog.controller';
import { StorefrontCatalogService } from './catalog.service';
import { StorefrontCheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { AdminInvoiceController, StorefrontInvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { ConsoleOtpProvider, OtpProvider, OtpService } from './otp';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay.service';

/** Customer-facing API: catalogue, checkout, OTP, payments, order lookup. All routes are public and tenant-bound by Host. */
@Module({
  imports: [CryptoModule, AuthModule],
  controllers: [StorefrontCatalogController, StorefrontCheckoutController, StorefrontInvoiceController, AdminInvoiceController],
  providers: [StorefrontCatalogService, CheckoutService, PaymentsService, RazorpayService, OtpService, InvoiceService, ConsoleOtpProvider, { provide: OtpProvider, useExisting: ConsoleOtpProvider }],
  exports: [StorefrontCatalogService, CheckoutService, PaymentsService, RazorpayService, OtpService, InvoiceService, ConsoleOtpProvider],
})
export class StorefrontModule {}
