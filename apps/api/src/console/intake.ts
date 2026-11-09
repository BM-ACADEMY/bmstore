import { BadRequestException } from '@nestjs/common';
import { ShippingMode } from '@prisma/client';
import { createHash } from 'node:crypto';
import { slugify } from '../common/slug';
import { LAYOUTS, layoutForCategory } from './layouts';

/**
 * The client intake, as the developer receives it (Google Form export, WhatsApp notes typed into the console form,
 * or n8n posting JSON). `normalizeIntake` accepts both shapes:
 *   JSON: { businessName, shipping: { mode, flatRatePaise, freeAbovePaise, notes }, cod: { enabled, chargePaise }, brandColors: [...] }
 *   form: flat strings, e.g. brandColors="#7c2d12, #b45309", shippingMode=FREE_ABOVE, shippingFlatRatePaise=6000, codEnabled=on
 * Money is integer paise everywhere (the console converts rupees before sending).
 */
export const RAZORPAY_STATUSES = ['not_started', 'kyc_pending', 'active', 'not_needed'] as const;
export type RazorpayStatus = (typeof RAZORPAY_STATUSES)[number];

export interface IntakeShipping { mode: ShippingMode; flatRatePaise: number; freeAbovePaise: number | null; notes: string | null }

export interface NormalizedIntake {
  intakeKey: string;
  businessName: string;
  ownerName: string | null;
  whatsapp: string | null;
  email: string | null;
  category: string | null;
  logoUrl: string | null;
  brandColors: string[];
  productSheet: string | null;
  gstNumber: string | null;
  address: string | null;
  domain: string | null;
  razorpayStatus: RazorpayStatus;
  shipping: IntakeShipping | null;
  codEnabled: boolean | null;
  codChargePaise: number;
  aboutText: string | null;
  layout: string;
  /** Optional overrides */
  subdomain: string | null;
  plan: 'STARTER' | 'STANDARD';
}

/** Fields that must be present before the intake counts as complete (and the 7-working-day clock starts). */
export const REQUIRED_FIELDS: Array<{ key: keyof NormalizedIntake; label: string }> = [
  { key: 'businessName', label: 'Business name' },
  { key: 'ownerName', label: 'Owner name' },
  { key: 'whatsapp', label: 'WhatsApp number' },
  { key: 'email', label: 'Email' },
  { key: 'category', label: 'Category' },
  { key: 'logoUrl', label: 'Logo' },
  { key: 'brandColors', label: 'Brand colours' },
  { key: 'productSheet', label: 'Product sheet' },
  { key: 'address', label: 'Address' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'codEnabled', label: 'Cash on delivery (yes/no)' },
  { key: 'aboutText', label: 'About text' },
];

type IntakeLike = Partial<Record<keyof NormalizedIntake, unknown>> & { razorpayStatus?: unknown };

/** Labels of missing required fields. Razorpay must be at least started unless the store is COD-only. */
export function missingFields(i: IntakeLike): string[] {
  const out: string[] = [];
  for (const f of REQUIRED_FIELDS) {
    const v = i[f.key];
    const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (f.key === 'shipping' && typeof v === 'object' && v !== null && !(v as any).mode);
    if (empty) out.push(f.label);
  }
  if (!i.razorpayStatus || i.razorpayStatus === 'not_started') out.push('Razorpay status (started KYC, active, or COD only)');
  return out;
}

const str = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw new BadRequestException(`A field is too long (max ${max} characters)`);
  return s;
};
const bool = (v: unknown): boolean | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'off', 'n'].includes(s)) return false;
  throw new BadRequestException(`Not a yes/no value: ${s.slice(0, 20)}`);
};
const paise = (v: unknown, label: string): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < 0 || n > 100_000_000) throw new BadRequestException(`${label} must be a whole number of paise`);
  return n;
};
const PHONE = /^\+?[0-9]{10,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GST = /^[0-9A-Z]{15}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Validate + coerce. Throws 400 with every problem listed (so the developer fixes them in one go). */
export function normalizeIntake(body: Record<string, any>): NormalizedIntake {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Send the intake as JSON or a form');
  const problems: string[] = [];
  const attempt = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch (e: any) { problems.push(e?.message ?? String(e)); return fallback; } };

  const businessName = attempt(() => str(body.businessName ?? body.business_name, 120), null);
  if (!businessName || businessName.length < 2) problems.push('Business name is required');

  const whatsapp = attempt(() => str(body.whatsapp ?? body.whatsappNumber, 20)?.replace(/[\s-]/g, '') ?? null, null);
  if (whatsapp && !PHONE.test(whatsapp)) problems.push('WhatsApp number: 10-15 digits');
  const email = attempt(() => str(body.email, 254)?.toLowerCase() ?? null, null);
  if (email && !EMAIL.test(email)) problems.push('Email is not valid');
  const gstNumber = attempt(() => str(body.gstNumber ?? body.gst, 15)?.toUpperCase() ?? null, null);
  if (gstNumber && !GST.test(gstNumber)) problems.push('GST number must be 15 letters/digits');
  const domain = attempt(() => str(body.domain, 253)?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '') ?? null, null);
  if (domain && !DOMAIN.test(domain)) problems.push('Domain must look like shop.example.com');

  const colorsRaw = body.brandColors ?? body.brand_colours ?? body.brandColours;
  const brandColors = (Array.isArray(colorsRaw) ? colorsRaw : typeof colorsRaw === 'string' ? colorsRaw.split(/[,\s]+/) : [])
    .map((c: unknown) => String(c).trim()).filter(Boolean).map((c: string) => (c.startsWith('#') ? c : `#${c}`));
  if (brandColors.some((c: string) => !HEX.test(c))) problems.push('Brand colours must be hex like #7C2D12');
  if (brandColors.length > 4) problems.push('At most 4 brand colours');

  const rzp = String(body.razorpayStatus ?? body.razorpay ?? 'not_started').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!RAZORPAY_STATUSES.includes(rzp as RazorpayStatus)) problems.push(`Razorpay status must be one of ${RAZORPAY_STATUSES.join(', ')}`);

  // shipping: nested or flat
  const sh = typeof body.shipping === 'object' && body.shipping ? body.shipping : {};
  const modeRaw = sh.mode ?? body.shippingMode;
  let shipping: IntakeShipping | null = null;
  if (modeRaw !== undefined && modeRaw !== null && modeRaw !== '') {
    const mode = String(modeRaw).trim().toUpperCase();
    if (!['FLAT', 'FREE', 'FREE_ABOVE'].includes(mode)) problems.push('Shipping mode must be FLAT, FREE or FREE_ABOVE');
    const flat = attempt(() => paise(sh.flatRatePaise ?? body.shippingFlatRatePaise, 'Flat shipping rate'), null) ?? 0;
    const free = attempt(() => paise(sh.freeAbovePaise ?? body.shippingFreeAbovePaise, 'Free-shipping threshold'), null);
    if (mode === 'FREE_ABOVE' && free === null) problems.push('Free-shipping threshold is required for FREE_ABOVE');
    const notes = attempt(() => str(sh.notes ?? body.shippingNotes, 500), null);
    shipping = { mode: mode as ShippingMode, flatRatePaise: flat, freeAbovePaise: free, notes };
  }
  const cod = typeof body.cod === 'object' && body.cod ? body.cod : {};
  const codEnabled = attempt(() => bool(cod.enabled ?? body.codEnabled ?? (typeof body.cod !== 'object' ? body.cod : undefined)), null);
  const codChargePaise = attempt(() => paise(cod.chargePaise ?? body.codChargePaise, 'COD charge'), null) ?? 0;

  const category = attempt(() => str(body.category, 80), null);
  const layoutRaw = attempt(() => str(body.layout, 40)?.toLowerCase() ?? null, null);
  if (layoutRaw && !LAYOUTS[layoutRaw]) problems.push(`Layout must be one of ${Object.keys(LAYOUTS).join(', ')}`);
  const subdomain = attempt(() => str(body.subdomain, 63)?.toLowerCase() ?? null, null);
  if (subdomain && !LABEL.test(subdomain)) problems.push('Subdomain: lowercase letters, digits and hyphens');
  const plan = String(body.plan ?? 'STANDARD').toUpperCase();
  if (plan !== 'STARTER' && plan !== 'STANDARD') problems.push('Plan must be STARTER or STANDARD');

  const out: Omit<NormalizedIntake, 'intakeKey'> = {
    businessName: businessName ?? '',
    ownerName: attempt(() => str(body.ownerName ?? body.owner_name, 120), null),
    whatsapp,
    email,
    category,
    logoUrl: attempt(() => str(body.logoUrl ?? body.logo, 1000), null),
    brandColors: brandColors.map((c: string) => c.toUpperCase()),
    productSheet: attempt(() => str(body.productSheet ?? body.product_sheet, 1000), null),
    gstNumber,
    address: attempt(() => str(body.address, 500), null),
    domain,
    razorpayStatus: rzp as RazorpayStatus,
    shipping,
    codEnabled,
    codChargePaise,
    aboutText: attempt(() => str(body.aboutText ?? body.about, 5000), null),
    layout: layoutRaw ?? layoutForCategory(category),
    subdomain,
    plan: plan as 'STARTER' | 'STANDARD',
  };
  const key = attempt(() => str(body.intakeKey ?? body.intakeId, 200), null);
  if (key && !/^[A-Za-z0-9._:-]+$/.test(key)) problems.push('intakeKey: letters, digits and . _ : - only');
  if (problems.length) throw new BadRequestException(problems);
  return { ...out, intakeKey: key ?? deriveIntakeKey(out.businessName, out.email) };
}

/** Same business + email => same key, so a form submitted twice creates one store. */
export function deriveIntakeKey(businessName: string, email: string | null): string {
  return 'auto:' + createHash('sha256').update(`${slugify(businessName, 'store')}|${(email ?? '').toLowerCase()}`).digest('hex').slice(0, 32);
}
