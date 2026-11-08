import { PaymentMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { STATE_NAMES } from './india';

export class CartItemDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() variantId?: string | null;
  @IsInt() @Min(1) @Max(50) qty!: number;
}
export class AddressDto {
  @IsString() @MinLength(3) @MaxLength(200) line1!: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string | null;
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsIn(STATE_NAMES, { message: 'Choose a state from the list' }) state!: string;
  @Matches(/^[1-9][0-9]{5}$/, { message: 'Pincode must be 6 digits' }) pincode!: string;
}
/** Totals preview while the shopper fills the form (no side effects). */
export class QuoteDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CartItemDto) items!: CartItemDto[];
  @IsOptional() @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @IsString() @MaxLength(80) state?: string | null;
  @IsOptional() @IsString() @MaxLength(30) couponCode?: string | null;
  @IsOptional() @IsEnum(PaymentMode) paymentMode?: PaymentMode = 'COD';
}
export class CheckoutDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CartItemDto) items!: CartItemDto[];
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(10) @MaxLength(16) phone!: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string | null;
  @ValidateNested() @Type(() => AddressDto) address!: AddressDto;
  @IsOptional() @IsString() @MaxLength(30) couponCode?: string | null;
  @IsEnum(PaymentMode) paymentMode!: PaymentMode;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
  /** From POST /storefront/otp/verify; optional */
  @IsOptional() @IsString() @MaxLength(200) phoneToken?: string | null;
}
export class OtpSendDto {
  @IsString() @MinLength(10) @MaxLength(16) phone!: string;
}
export class OtpVerifyDto {
  @IsString() @MinLength(10) @MaxLength(16) phone!: string;
  @Matches(/^\d{6}$/) code!: string;
}
export class VerifyPaymentDto {
  @IsString() @MaxLength(40) orderNo!: string;
  @IsString() @MaxLength(64) razorpay_order_id!: string;
  @IsString() @MaxLength(64) razorpay_payment_id!: string;
  @IsString() @MaxLength(128) razorpay_signature!: string;
}
export class LookupQuery {
  @IsString() @MaxLength(40) orderNo!: string;
  @IsOptional() @IsString() @MaxLength(16) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) token?: string;
}
