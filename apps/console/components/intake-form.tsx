'use client';

import { useState } from 'react';
import { Field } from '@/components/ui';
import { toPaise } from '@/lib/format';

/** The intake fields as a form. Rupee amounts are converted to integer paise before they leave the browser. */
export interface IntakeValues {
  businessName: string; ownerName: string; whatsapp: string; email: string; category: string; logoUrl: string;
  brandColor1: string; brandColor2: string; productSheet: string; gstNumber: string; address: string; domain: string;
  razorpayStatus: string; shippingMode: string; flatRate: string; freeAbove: string; shippingNotes: string;
  codEnabled: string; codCharge: string; aboutText: string; layout: string;
}

export const emptyIntake: IntakeValues = {
  businessName: '', ownerName: '', whatsapp: '', email: '', category: '', logoUrl: '', brandColor1: '', brandColor2: '', productSheet: '',
  gstNumber: '', address: '', domain: '', razorpayStatus: 'not_started', shippingMode: '', flatRate: '', freeAbove: '', shippingNotes: '',
  codEnabled: '', codCharge: '', aboutText: '', layout: '',
};

const paiseOrUndef = (s: string) => (s.trim() ? toPaise(s) : undefined);
const rup = (p: unknown) => (typeof p === 'number' ? String(p / 100) : '');

/** Form values -> API JSON (only filled fields are sent). Throws on a bad rupee amount. */
export function toIntakeJson(v: IntakeValues, extra: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { ...extra };
  for (const k of ['businessName', 'ownerName', 'whatsapp', 'email', 'category', 'logoUrl', 'productSheet', 'gstNumber', 'address', 'domain', 'aboutText', 'layout', 'razorpayStatus'] as const) {
    if (v[k].trim()) out[k] = v[k].trim();
  }
  const colours = [v.brandColor1, v.brandColor2].map((c) => c.trim()).filter(Boolean);
  if (colours.length) out.brandColors = colours;
  if (v.shippingMode) out.shipping = { mode: v.shippingMode, flatRatePaise: paiseOrUndef(v.flatRate) ?? 0, freeAbovePaise: paiseOrUndef(v.freeAbove) ?? null, notes: v.shippingNotes.trim() || null };
  if (v.codEnabled) out.cod = { enabled: v.codEnabled === 'yes', chargePaise: paiseOrUndef(v.codCharge) ?? 0 };
  return out;
}

/** Stored intake -> form values (for editing). */
export function fromIntake(i: any): IntakeValues {
  const sh = i?.shipping ?? {};
  return {
    ...emptyIntake,
    businessName: i.businessName ?? '', ownerName: i.ownerName ?? '', whatsapp: i.whatsapp ?? '', email: i.email ?? '', category: i.category ?? '',
    logoUrl: i.logoUrl ?? '', brandColor1: i.brandColors?.[0] ?? '', brandColor2: i.brandColors?.[1] ?? '', productSheet: i.productSheet ?? '',
    gstNumber: i.gstNumber ?? '', address: i.address ?? '', domain: i.domain ?? '', razorpayStatus: i.razorpayStatus ?? 'not_started',
    shippingMode: sh.mode ?? '', flatRate: rup(sh.flatRatePaise), freeAbove: rup(sh.freeAbovePaise), shippingNotes: sh.notes ?? '',
    codEnabled: i.codEnabled === true ? 'yes' : i.codEnabled === false ? 'no' : '', codCharge: rup(i.codChargePaise), aboutText: i.aboutText ?? '', layout: i.layout ?? '',
  };
}

export function IntakeForm({ value, onChange, layouts, lockName = false }: { value: IntakeValues; onChange: (v: IntakeValues) => void; layouts: Array<{ id: string; label: string; description: string }>; lockName?: boolean }) {
  const set = (k: keyof IntakeValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-5">
      <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
        <legend className="h-section mb-2">Business</legend>
        <Field label="Business name *"><input className="field" value={value.businessName} onChange={set('businessName')} disabled={lockName} required /></Field>
        <Field label="Category" hint="e.g. Sarees, Grocery, Handicrafts"><input className="field" value={value.category} onChange={set('category')} /></Field>
        <Field label="Owner name"><input className="field" value={value.ownerName} onChange={set('ownerName')} /></Field>
        <Field label="WhatsApp"><input className="field" inputMode="tel" placeholder="+91…" value={value.whatsapp} onChange={set('whatsapp')} /></Field>
        <Field label="Email" hint="Becomes the store-owner login"><input className="field" type="email" value={value.email} onChange={set('email')} /></Field>
        <Field label="GST number"><input className="field" value={value.gstNumber} onChange={set('gstNumber')} /></Field>
        <div className="sm:col-span-2"><Field label="Address"><textarea className="field py-2.5" rows={2} value={value.address} onChange={set('address')} /></Field></div>
      </fieldset>

      <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
        <legend className="h-section mb-2">Look</legend>
        <Field label="Layout" hint="Leave empty to pick from the category">
          <select className="field" value={value.layout} onChange={set('layout')}>
            <option value="">From category</option>
            {layouts.map((l) => <option key={l.id} value={l.id}>{l.label}: {l.description}</option>)}
          </select>
        </Field>
        <Field label="Logo" hint="Link or file name the client sent"><input className="field" value={value.logoUrl} onChange={set('logoUrl')} /></Field>
        <Field label="Brand colour 1"><div className="flex gap-2"><input className="field" placeholder="#7C2D12" value={value.brandColor1} onChange={set('brandColor1')} /><input type="color" aria-label="Pick colour 1" className="h-11 w-12 rounded-xl border border-line" value={/^#[0-9a-f]{6}$/i.test(value.brandColor1) ? value.brandColor1 : '#000000'} onChange={set('brandColor1')} /></div></Field>
        <Field label="Brand colour 2"><div className="flex gap-2"><input className="field" placeholder="#B45309" value={value.brandColor2} onChange={set('brandColor2')} /><input type="color" aria-label="Pick colour 2" className="h-11 w-12 rounded-xl border border-line" value={/^#[0-9a-f]{6}$/i.test(value.brandColor2) ? value.brandColor2 : '#000000'} onChange={set('brandColor2')} /></div></Field>
        <div className="sm:col-span-2"><Field label="About text"><textarea className="field py-2.5" rows={3} value={value.aboutText} onChange={set('aboutText')} /></Field></div>
      </fieldset>

      <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
        <button type="button" className="h-section mb-1 text-left sm:col-span-2" onClick={() => setOpen(!open)}>Selling {open ? '▾' : '▸'}</button>
        {open && <>
          <Field label="Product sheet" hint="File name or link; import it on the store page"><input className="field" value={value.productSheet} onChange={set('productSheet')} /></Field>
          <Field label="Domain" hint="Optional, e.g. shop.example.in"><input className="field" value={value.domain} onChange={set('domain')} /></Field>
          <Field label="Razorpay">
            <select className="field" value={value.razorpayStatus} onChange={set('razorpayStatus')}>
              <option value="not_started">Not started</option><option value="kyc_pending">KYC pending</option><option value="active">Active (keys ready)</option><option value="not_needed">Not needed (COD only)</option>
            </select>
          </Field>
          <Field label="Cash on delivery">
            <select className="field" value={value.codEnabled} onChange={set('codEnabled')}><option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option></select>
          </Field>
          {value.codEnabled === 'yes' && <Field label="COD charge (₹)"><input className="field" inputMode="decimal" value={value.codCharge} onChange={set('codCharge')} /></Field>}
          <Field label="Shipping">
            <select className="field" value={value.shippingMode} onChange={set('shippingMode')}><option value="">Not answered</option><option value="FLAT">Flat rate</option><option value="FREE">Always free</option><option value="FREE_ABOVE">Free above an amount</option></select>
          </Field>
          {(value.shippingMode === 'FLAT' || value.shippingMode === 'FREE_ABOVE') && <Field label="Flat rate (₹)"><input className="field" inputMode="decimal" value={value.flatRate} onChange={set('flatRate')} /></Field>}
          {value.shippingMode === 'FREE_ABOVE' && <Field label="Free above (₹)"><input className="field" inputMode="decimal" value={value.freeAbove} onChange={set('freeAbove')} /></Field>}
          <div className="sm:col-span-2"><Field label="Shipping notes" hint="Shown on the Shipping Policy as written"><input className="field" value={value.shippingNotes} onChange={set('shippingNotes')} /></Field></div>
        </>}
      </fieldset>
    </div>
  );
}
