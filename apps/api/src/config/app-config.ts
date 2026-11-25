import { Injectable } from '@nestjs/common';

/**
 * Typed, validated environment. Fails fast at boot on missing/weak secrets.
 * Never log this object: it holds secrets.
 */
@Injectable()
export class AppConfig {
  readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  readonly port = Number(process.env.PORT ?? 3000);
  /**
   * Platform base domain: stores live at <slug>.<PLATFORM_BASE_DOMAIN> and client domains CNAME to it.
   * Default store.bmtechx.in. Dev keeps storename.localhost (ROOT_DOMAIN=localhost).
   */
  readonly platformBaseDomain = (process.env.PLATFORM_BASE_DOMAIN || 'store.bmtechx.in').toLowerCase().replace(/\.$/, '');
  /** Host suffix used to resolve tenants. ROOT_DOMAIN if set; otherwise the platform base domain in production, localhost elsewhere. */
  readonly rootDomain = (process.env.ROOT_DOMAIN ?? (process.env.NODE_ENV === 'production' ? this.platformBaseDomain : 'localhost')).toLowerCase();
  readonly trustProxy = process.env.TRUST_PROXY === '1';
  /** Application role: owns no tables, NOBYPASSRLS. Row-level security applies to every query. */
  readonly databaseUrl = required('DATABASE_URL');
  /** Owner role: migrations and the audited superadmin bypass. Exempt from RLS. Never used for tenant traffic. */
  readonly databaseAdminUrl = required('DATABASE_ADMIN_URL');
  readonly redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  readonly tenantCacheTtl = Number(process.env.TENANT_CACHE_TTL_SECONDS ?? 300);
  /** Short negative cache so random Host headers cannot hammer Postgres. */
  readonly tenantNegativeCacheTtl = 60;
  readonly jwtAccessSecret = minLen('JWT_ACCESS_SECRET', 32);
  readonly jwtAccessTtl = process.env.JWT_ACCESS_TTL ?? '15m';
  readonly refreshTtlDays = Number(process.env.REFRESH_TTL_DAYS ?? 30);
  readonly encryptionKey = parseKey(required('ENCRYPTION_KEY'));

  // --- Login protection (src/auth/throttle.service.ts) ---
  /** Login attempts per client IP per window (Redis). */
  readonly loginIpLimit = Number(process.env.LOGIN_IP_LIMIT ?? 20);
  readonly loginIpWindowSec = Number(process.env.LOGIN_IP_WINDOW_SECONDS ?? 60);
  /** Consecutive failures on one account before it locks; the lock doubles from lockBaseSec up to lockMaxSec. */
  readonly loginMaxFailures = Number(process.env.LOGIN_MAX_FAILURES ?? 5);
  readonly lockBaseSec = Number(process.env.LOGIN_LOCK_BASE_SECONDS ?? 60);
  readonly lockMaxSec = Number(process.env.LOGIN_LOCK_MAX_SECONDS ?? 3600);
  /** Password reset: token lifetime and the link put in the email ({host} = request Host, {token} = raw token). */
  readonly passwordResetTtlMin = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 30);
  readonly passwordResetUrlTemplate = process.env.PASSWORD_RESET_URL_TEMPLATE ?? 'https://{host}/reset-password?token={token}';
  // --- Uploads: direct-to-S3 presigned PUTs (src/uploads). Unset S3_BUCKET => uploads answer 503. ---
  readonly s3Bucket = process.env.S3_BUCKET || undefined;
  readonly s3Region = process.env.S3_REGION ?? 'ap-south-1';
  /** Optional, for S3-compatible stores (R2, MinIO). */
  readonly s3Endpoint = process.env.S3_ENDPOINT || undefined;
  readonly s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE === '1';
  readonly s3AccessKeyId = process.env.S3_ACCESS_KEY_ID || undefined;
  readonly s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY || undefined;
  /** Where uploaded objects are served from (CDN). Defaults to the bucket's own URL. */
  readonly s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL || undefined;
  readonly uploadMaxBytes = Number(process.env.UPLOAD_MAX_BYTES ?? 12 * 1024 * 1024);
  /** Image processing worker inside the API process (MEDIA_WORKER=0 to run it elsewhere). Off under test; tests call runOnce(). */
  readonly mediaWorkerEnabled = (process.env.MEDIA_WORKER ?? (process.env.NODE_ENV === 'test' ? '0' : '1')) === '1';
  readonly mediaWorkerIntervalMs = Number(process.env.MEDIA_WORKER_INTERVAL_MS ?? 3000);
  readonly uploadUrlTtlSec = Number(process.env.UPLOAD_URL_TTL_SECONDS ?? 300);

  /** Forgot-password requests per email per window (silently dropped above it) and per IP. */
  readonly forgotPerEmailLimit = Number(process.env.FORGOT_PER_EMAIL_LIMIT ?? 3);
  readonly forgotPerIpLimit = Number(process.env.FORGOT_PER_IP_LIMIT ?? 10);
  readonly forgotWindowSec = Number(process.env.FORGOT_WINDOW_SECONDS ?? 900);
  // --- Storefront (src/storefront) ---
  /** Checkout attempts per IP per window, OTP sends per phone and per IP, order lookups per IP. Redis-backed, fail open. */
  readonly checkoutIpLimit = Number(process.env.CHECKOUT_IP_LIMIT ?? 10);
  readonly checkoutWindowSec = Number(process.env.CHECKOUT_WINDOW_SECONDS ?? 600);
  readonly otpPhoneLimit = Number(process.env.OTP_PHONE_LIMIT ?? 5);
  readonly otpIpLimit = Number(process.env.OTP_IP_LIMIT ?? 20);
  readonly otpWindowSec = Number(process.env.OTP_WINDOW_SECONDS ?? 600);
  readonly otpTtlSec = Number(process.env.OTP_TTL_SECONDS ?? 300);
  readonly lookupIpLimit = Number(process.env.LOOKUP_IP_LIMIT ?? 20);
  readonly lookupWindowSec = Number(process.env.LOOKUP_WINDOW_SECONDS ?? 600);
  /** Razorpay REST base; tests point it at an in-process double. Keys are per tenant (encrypted in tenants). */
  readonly razorpayApiBase = (process.env.RAZORPAY_API_BASE ?? 'https://api.razorpay.com').replace(/\/$/, '');
  /** Background jobs (unpaid-order expiry, weekly summary) inside the API process; off under test. */
  readonly jobsEnabled = (process.env.JOBS_ENABLED ?? (process.env.NODE_ENV === 'test' ? '0' : '1')) === '1';
  readonly jobsIntervalMs = Number(process.env.JOBS_INTERVAL_MS ?? 60_000);
  /** Subdomains that are platform hosts, never tenants. */
  readonly reservedSubdomains = new Set(['www', 'admin', 'api', 'app', 'static', 'cdn', 'mail', 'console', 'media', 'minio']);

  // --- Phase 5: developer console, provisioning, QA, jobs, webhooks ---
  /** Public store URL. {host} = <subdomain>.<rootDomain>. Dev default points at the storefront dev server. */
  readonly storeUrlTemplate = process.env.STORE_URL_TEMPLATE || (this.rootDomain === 'localhost' ? 'http://{host}:3002' : 'https://{host}');
  /** Store admin URL (impersonation lands here). {host} = <subdomain>.<rootDomain>. */
  readonly adminUrlTemplate = process.env.ADMIN_URL_TEMPLATE || (this.rootDomain === 'localhost' ? 'http://{host}:3001/admin' : 'https://{host}/admin');
  /** BullMQ platform jobs (chasers, renewals, expiry, backup, usage, developer summary) + webhook delivery worker. Off under test. */
  readonly platformJobsEnabled = (process.env.JOBS_WORKER ?? (process.env.NODE_ENV === 'test' ? '0' : '1')) === '1';
  /** Outbound n8n webhook (one URL receives every event; n8n routes on `event`). Unset => events are recorded, not sent. */
  readonly n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || undefined;
  /** HMAC-SHA256 key for the X-BMStore-Signature header. */
  readonly webhookSecret = process.env.WEBHOOK_SECRET || undefined;
  /** Platform Razorpay account (client fees). Refund helper uses it; test-mode keys only unless RAZORPAY_ALLOW_LIVE_REFUNDS=1. */
  readonly platformRazorpayKeyId = process.env.PLATFORM_RAZORPAY_KEY_ID || undefined;
  readonly platformRazorpayKeySecret = process.env.PLATFORM_RAZORPAY_KEY_SECRET || undefined;
  readonly allowLiveRefunds = process.env.RAZORPAY_ALLOW_LIVE_REFUNDS === '1';
  /** Seller on credit notes (the platform business). */
  readonly platformLegalName = process.env.PLATFORM_LEGAL_NAME || 'BM Techx';
  readonly platformGstin = process.env.PLATFORM_GSTIN || undefined;
  readonly platformAddress = process.env.PLATFORM_ADDRESS || undefined;
  /** Developer contact for alerts (stubbed WhatsApp / email). */
  readonly developerWhatsapp = process.env.DEVELOPER_WHATSAPP || '919403892971';
  readonly developerEmail = process.env.DEVELOPER_EMAIL || undefined;
  /** Where infra/backup writes its state files (backup.nightly.last). */
  readonly backupStateDir = process.env.BMSTORE_STATE_DIR || '/state';
  /** Public holidays (YYYY-MM-DD, comma separated) skipped when counting working days. */
  /** QA Lighthouse check: path to the lighthouse CLI and Chrome. Unset => the check reports "skipped". */
  readonly lighthouseBin = process.env.LIGHTHOUSE_BIN || undefined;
  readonly chromePath = process.env.CHROME_PATH || undefined;
  readonly holidays = new Set((process.env.WORKING_DAY_HOLIDAYS ?? '').split(',').map((s) => s.trim()).filter(Boolean));

  get isProd() {
    return this.nodeEnv === 'production';
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function minLen(name: string, n: number): string {
  const v = required(name);
  if (v.length < n) throw new Error(`${name} must be at least ${n} characters`);
  return v;
}

function parseKey(raw: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or 64 hex chars)');
  return key;
}
