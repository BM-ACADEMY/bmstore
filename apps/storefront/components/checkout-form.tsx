'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { useCart } from '@/lib/cart';
import { rupees } from '@/lib/money';
import { payWithRazorpay } from '@/lib/razorpay';
import { STATES } from '@/lib/states';
import { useStore, useT } from '@/lib/store-context';
import { couponKey } from './cart-view';
import { CheckIcon } from './icons';

interface Quote { items: Array<{ productId: string; variantId: string | null; name: string; qty: number; unitPrice: number; total: number; available: boolean }>; subtotal: number; discount: number; shipping: number; shippingReason: string; codCharge: number; tax: number; total: number; coupon: { code: string } | null; payments: { cod: boolean; online: boolean } }
interface Placed { orderNo: string; total: number; paymentMode: 'COD' | 'ONLINE'; token: string; razorpay?: any }
type Mode = 'COD' | 'ONLINE';
const DRAFT = 'bm_checkout_draft';

export function CheckoutForm() {
  const t = useT();
  const { store, payments, settings } = useStore();
  const cart = useCart();
  const router = useRouter();
  const [f, setF] = useState({ name: '', phone: '', email: '', line1: '', line2: '', city: '', state: 'Tamil Nadu', pincode: '', note: '' });
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(payments.online ? 'ONLINE' : 'COD');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [otp, setOtp] = useState<{ sent: boolean; code: string; token: string | null; busy: boolean; error: string | null }>({ sent: false, code: '', token: null, busy: false, error: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const items = useMemo(() => cart.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })), [cart.lines]);

  useEffect(() => { try { const d = localStorage.getItem(DRAFT); if (d) setF((cur) => ({ ...cur, ...JSON.parse(d) })); const c = localStorage.getItem(couponKey(store.slug)); if (c) { setCoupon(c); setCouponInput(c); } } catch { /* ignore */ } }, [store.slug]);
  useEffect(() => { try { const { note, ...keep } = f; localStorage.setItem(DRAFT, JSON.stringify(keep)); } catch { /* ignore */ } }, [f]);
  useEffect(() => { if (cart.ready && !cart.lines.length && !busy) router.replace('/cart'); }, [cart.ready, cart.lines.length, busy, router]);

  // re-quote whenever anything that changes money changes (server is the source of truth)
  useEffect(() => {
    if (!cart.ready || !items.length) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const q = await api<Quote>('/quote', { method: 'POST', json: { items, city: f.city || null, state: f.state || null, couponCode: coupon, paymentMode: mode } });
        setQuote(q); setQuoteError(null); setCouponError(null);
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : t('error.generic');
        if (coupon) { setCoupon(null); setCouponError(msg); } else setQuoteError(msg);
      }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [items, f.city, f.state, coupon, mode, cart.ready, t]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setFieldErrors((x) => ({ ...x, [k]: '' })); };
  const phoneOk = /^(?:\+?91|0)?[6-9]\d{9}$/.test(f.phone.replace(/\s/g, ''));

  const sendOtp = async () => {
    setOtp((o) => ({ ...o, busy: true, error: null }));
    try { await api('/otp/send', { method: 'POST', json: { phone: f.phone } }); setOtp((o) => ({ ...o, sent: true, busy: false })); }
    catch (e) { setOtp((o) => ({ ...o, busy: false, error: e instanceof ApiError ? e.message : t('error.generic') })); }
  };
  const verifyOtp = async () => {
    setOtp((o) => ({ ...o, busy: true, error: null }));
    try { const r = await api<{ phoneToken: string }>('/otp/verify', { method: 'POST', json: { phone: f.phone, code: otp.code } }); setOtp((o) => ({ ...o, token: r.phoneToken, busy: false })); }
    catch (e) { setOtp((o) => ({ ...o, busy: false, error: e instanceof ApiError ? e.message : t('error.generic') })); }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = t('checkout.name');
    if (!phoneOk) errs.phone = t('checkout.phoneHint');
    if (f.line1.trim().length < 3) errs.line1 = t('checkout.line1');
    if (f.city.trim().length < 2) errs.city = t('checkout.city');
    if (!/^[1-9][0-9]{5}$/.test(f.pincode)) errs.pincode = t('checkout.pincode');
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) errs.email = t('checkout.email');
    setFieldErrors(errs);
    return !Object.keys(errs).length;
  };

  const place = async () => {
    setError(null);
    if (!validate()) { document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    setBusy(true);
    try {
      const placed = await api<Placed>('/checkout', { method: 'POST', json: {
        items, name: f.name.trim(), phone: f.phone, email: f.email || null, address: { line1: f.line1, line2: f.line2 || null, city: f.city, state: f.state, pincode: f.pincode },
        couponCode: coupon, paymentMode: mode, note: f.note || null, phoneToken: otp.token,
      } });
      if (placed.paymentMode === 'ONLINE' && placed.razorpay) {
        try {
          const result = await payWithRazorpay(placed.razorpay, getComputedStyle(document.documentElement).getPropertyValue('--sf-primary').trim() || '#7A1F2B');
          await api('/payments/razorpay/verify', { method: 'POST', json: { orderNo: placed.orderNo, ...result } });
        } catch (e) {
          // the order exists and holds its stock for a while; the confirmation page offers "Complete payment"
          cart.clear();
          router.push(`/order/${encodeURIComponent(placed.orderNo)}?t=${placed.token}&pay=retry`);
          return;
        }
      }
      cart.clear();
      try { localStorage.removeItem(DRAFT); localStorage.removeItem(couponKey(store.slug)); } catch { /* ignore */ }
      router.push(`/order/${encodeURIComponent(placed.orderNo)}?t=${placed.token}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error.generic'));
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!cart.ready || !cart.lines.length) return <div className="min-h-[60dvh]" aria-busy="true" />; // empty carts are redirected to /cart above; keep the height so nothing jumps
  const Err = ({ k }: { k: string }) => (fieldErrors[k] ? <span className="block mt-1 text-xs text-bad">{fieldErrors[k]}</span> : null);
  const inputProps = (k: keyof typeof f) => ({ value: f[k], onChange: set(k), 'aria-invalid': fieldErrors[k] ? true : undefined, className: `field ${fieldErrors[k] ? 'border-bad' : ''}` });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <form className="flex flex-col gap-8" onSubmit={(e) => { e.preventDefault(); place(); }} noValidate>
        {error && <div role="alert" className="rounded-card bg-bad-soft text-bad px-4 py-3 text-sm font-medium">{error}</div>}

        <section>
          <h2 className="font-heading text-xl mb-3">{t('checkout.contact')}</h2>
          <label className="block"><span className="label">{t('checkout.phone')}</span>
            <div className="flex gap-2">
              <input {...inputProps('phone')} type="tel" inputMode="numeric" autoComplete="tel" placeholder="98765 43210" disabled={Boolean(otp.token)} />
              {!otp.token && <button type="button" className="btn-outline shrink-0 px-4" disabled={!phoneOk || otp.busy} onClick={sendOtp}>{otp.sent ? '↻' : t('checkout.sendOtp')}</button>}
            </div>
            <Err k="phone" />
            {!fieldErrors.phone && !otp.sent && <span className="block mt-1 text-xs text-ink-3">{t('checkout.phoneHint')}</span>}
          </label>
          {otp.sent && !otp.token && (
            <div className="mt-3 flex gap-2 items-start">
              <div className="flex-1"><input className="field tracking-[0.3em] text-center" inputMode="numeric" maxLength={6} placeholder="••••••" value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value.replace(/\D/g, '') })} aria-label={t('checkout.otp')} /></div>
              <button type="button" className="btn-primary px-4" disabled={otp.code.length !== 6 || otp.busy} onClick={verifyOtp}>{t('checkout.verify')}</button>
            </div>
          )}
          {otp.error && <p className="mt-1 text-xs text-bad">{otp.error}</p>}
          {otp.token && <p className="mt-2 text-sm text-ok inline-flex items-center gap-1"><CheckIcon className="h-4 w-4" />{t('checkout.verified')}</p>}
          {otp.sent && !otp.token && <p className="mt-1 text-xs text-ink-3">{t('checkout.skipOtp')}</p>}
          <label className="block mt-4"><span className="label">{t('checkout.name')}</span><input {...inputProps('name')} autoComplete="name" /><Err k="name" /></label>
          <label className="block mt-4"><span className="label">{t('checkout.email')}</span><input {...inputProps('email')} type="email" inputMode="email" autoComplete="email" /><Err k="email" /></label>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">{t('checkout.address')}</h2>
          <label className="block"><span className="label">{t('checkout.line1')}</span><input {...inputProps('line1')} autoComplete="address-line1" /><Err k="line1" /></label>
          <label className="block mt-4"><span className="label">{t('checkout.line2')}</span><input {...inputProps('line2')} autoComplete="address-line2" /></label>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <label className="block"><span className="label">{t('checkout.city')}</span><input {...inputProps('city')} autoComplete="address-level2" list="city-list" /><Err k="city" />
              {settings.cities.length > 0 && <datalist id="city-list">{settings.cities.map((c) => <option key={c.city} value={c.city} />)}</datalist>}
            </label>
            <label className="block"><span className="label">{t('checkout.pincode')}</span><input {...inputProps('pincode')} inputMode="numeric" maxLength={6} autoComplete="postal-code" /><Err k="pincode" /></label>
          </div>
          <label className="block mt-4"><span className="label">{t('checkout.state')}</span>
            <select {...inputProps('state')} autoComplete="address-level1">{STATES.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="block mt-4"><span className="label">{t('checkout.note')}</span><textarea {...inputProps('note')} rows={2} className="field py-3 min-h-20" maxLength={500} /></label>
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">{t('checkout.coupon')}</h2>
          {coupon ? (
            <div className="flex items-center justify-between rounded-card bg-accent-soft px-4 py-3">
              <span className="font-semibold text-primary-text inline-flex items-center gap-2"><CheckIcon className="h-5 w-5" />{coupon}{quote?.discount ? ` · −${rupees(quote.discount)}` : ''}</span>
              <button type="button" className="text-sm underline underline-offset-4" onClick={() => { setCoupon(null); setCouponInput(''); }}>{t('checkout.removeCoupon')}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className="field uppercase" value={couponInput} onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }} placeholder="WELCOME10" aria-label={t('checkout.coupon')} />
              <button type="button" className="btn-outline px-5" disabled={!couponInput.trim()} onClick={() => setCoupon(couponInput.trim())}>{t('checkout.applyCoupon')}</button>
            </div>
          )}
          {couponError && <p className="mt-1 text-xs text-bad">{couponError}</p>}
        </section>

        <section>
          <h2 className="font-heading text-xl mb-3">{t('checkout.payment')}</h2>
          <div className="grid gap-3">
            {payments.online && (
              <label className={`flex items-start gap-3 rounded-card border p-4 cursor-pointer ${mode === 'ONLINE' ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
                <input type="radio" name="pay" className="mt-1 h-5 w-5 accent-[var(--sf-primary)]" checked={mode === 'ONLINE'} onChange={() => setMode('ONLINE')} />
                <span><span className="block font-semibold">{t('checkout.online')}</span><span className="block text-sm text-ink-2">{t('checkout.onlineHint')}</span></span>
              </label>
            )}
            {payments.cod && (
              <label className={`flex items-start gap-3 rounded-card border p-4 cursor-pointer ${mode === 'COD' ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
                <input type="radio" name="pay" className="mt-1 h-5 w-5 accent-[var(--sf-primary)]" checked={mode === 'COD'} onChange={() => setMode('COD')} />
                <span><span className="block font-semibold">{t('checkout.cod')}</span>{settings.codCharge > 0 && <span className="block text-sm text-ink-2">{t('checkout.codCharge', { amount: rupees(settings.codCharge) })}</span>}</span>
              </label>
            )}
          </div>
        </section>

        <div className="lg:hidden"><Summary quote={quote} error={quoteError} t={t} /></div>
        <button type="submit" className="btn-primary w-full text-base" disabled={busy || !quote}>
          {busy ? t('checkout.placing') : mode === 'ONLINE' && quote ? t('checkout.payNow', { amount: rupees(quote.total) }) : t('checkout.placeOrder')}
        </button>
        <p className="text-xs text-ink-3 -mt-4">{t('checkout.terms')} <Link href="/pages/terms-and-conditions" className="underline">{t('nav.policies')}</Link></p>
      </form>
      <aside className="hidden lg:block"><div className="sticky top-24"><Summary quote={quote} error={quoteError} t={t} /></div></aside>
    </div>
  );
}

function Summary({ quote, error, t }: { quote: Quote | null; error: string | null; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (error) return <div className="card p-5 text-sm text-bad">{error}</div>;
  if (!quote) return <div className="card p-5 min-h-40 animate-pulse" aria-busy="true"><div className="h-5 w-32 rounded bg-line" /><div className="mt-4 h-4 w-full rounded bg-line" /><div className="mt-2 h-4 w-2/3 rounded bg-line" /></div>;
  const row = (label: string, value: string, strong = false) => <div className={`flex justify-between py-1 ${strong ? 'text-lg font-semibold mt-2 border-t border-line pt-3' : 'text-sm text-ink-2'}`}><span>{label}</span><span className={strong ? '' : 'text-ink'}>{value}</span></div>;
  return (
    <div className="card p-5">
      <h2 className="font-heading text-lg mb-3">{t('checkout.summary')}</h2>
      <ul className="mb-3 divide-y divide-line">
        {quote.items.map((i) => <li key={`${i.productId}:${i.variantId}`} className="flex justify-between gap-3 py-2 text-sm"><span className="text-ink-2">{i.name} × {i.qty}</span><span>{rupees(i.total)}</span></li>)}
      </ul>
      {row(t('checkout.subtotal'), rupees(quote.subtotal))}
      {quote.discount > 0 && row(t('checkout.discount'), `−${rupees(quote.discount)}`)}
      {row(t('checkout.shipping'), quote.shipping === 0 ? t('checkout.free') : rupees(quote.shipping))}
      {quote.codCharge > 0 && row(t('checkout.codFee'), rupees(quote.codCharge))}
      {row(t('checkout.total'), rupees(quote.total), true)}
      {quote.tax > 0 && <p className="text-xs text-ink-3 mt-1">{t('checkout.tax')} {rupees(quote.tax)}</p>}
    </div>
  );
}
