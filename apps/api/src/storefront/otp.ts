import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { RequestContext } from '../common/request-context';
import { RedisService } from '../redis/redis.service';

/** Delivers a one-time code to a phone. STUB today; replace with an SMS/WhatsApp gateway without touching callers. */
export abstract class OtpProvider {
  abstract send(phone: string, code: string, storeName: string): Promise<void>;
}
@Injectable()
export class ConsoleOtpProvider extends OtpProvider {
  private readonly log = new Logger('OTP');
  /** In-memory record of the last code per phone so tests and local checkout can read it. Never populated in production. */
  readonly lastCodes = new Map<string, string>();
  async send(phone: string, code: string, storeName: string): Promise<void> {
    const prod = process.env.NODE_ENV === 'production';
    if (!prod) this.lastCodes.set(phone, code);
    // The code itself is never logged in production (it is a secret); locally it is the only way to complete checkout.
    this.log.log(`OTP (stub provider) for ${storeName} to ${mask(phone)}${prod ? '' : ` code=${code}`}`);
  }
}
export const mask = (phone: string) => `${phone.slice(0, 2)}******${phone.slice(-2)}`;

/**
 * Codes live in Redis for OTP_TTL_SECONDS as a sha256 (never plaintext), 5 attempts, scoped to the store. A verified
 * phone yields a signed token the checkout request can carry; checkout stays possible without it (OTP is optional).
 */
@Injectable()
export class OtpService {
  constructor(private readonly cfg: AppConfig, private readonly redis: RedisService, private readonly provider: OtpProvider) {}
  private key(phone: string) { return `otp:${RequestContext.tenantId()}:${phone}`; }

  async send(phone: string, storeName: string): Promise<{ ttlSeconds: number }> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      await this.redis.client.set(this.key(phone), sha(code), 'EX', this.cfg.otpTtlSec);
      await this.redis.client.del(`${this.key(phone)}:tries`);
    } catch {
      throw new BadRequestException('OTP is temporarily unavailable, continue without it');
    }
    await this.provider.send(phone, code, storeName);
    return { ttlSeconds: this.cfg.otpTtlSec };
  }

  async verify(phone: string, code: string): Promise<{ phoneToken: string }> {
    const k = this.key(phone);
    let stored: string | null = null;
    let tries = 0;
    try {
      stored = await this.redis.client.get(k);
      tries = await this.redis.client.incr(`${k}:tries`);
      await this.redis.client.expire(`${k}:tries`, this.cfg.otpTtlSec);
    } catch {
      throw new BadRequestException('OTP is temporarily unavailable, continue without it');
    }
    if (!stored) throw new BadRequestException('The code has expired, request a new one');
    if (tries > 5) { await this.redis.del(k); throw new BadRequestException('Too many wrong codes, request a new one'); }
    const a = Buffer.from(stored), b = Buffer.from(sha(code));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new BadRequestException('That code is not right');
    await this.redis.del(k, `${k}:tries`);
    return { phoneToken: this.phoneToken(phone) };
  }

  /** Signed, 1 hour: `<exp>.<hmac(tenant|phone|exp)>` */
  phoneToken(phone: string, now = Date.now()): string {
    const exp = Math.floor(now / 1000) + 3600;
    return `${exp}.${createHmac('sha256', this.cfg.jwtAccessSecret).update(`${RequestContext.tenantId()}|${phone}|${exp}`).digest('base64url')}`;
  }
  isPhoneVerified(phone: string, token: string | undefined, now = Date.now()): boolean {
    if (!token) return false;
    const [expS, mac] = token.split('.');
    const exp = Number(expS);
    if (!exp || exp * 1000 < now || !mac) return false;
    const want = createHmac('sha256', this.cfg.jwtAccessSecret).update(`${RequestContext.tenantId()}|${phone}|${exp}`).digest('base64url');
    const a = Buffer.from(want), b = Buffer.from(mac);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
