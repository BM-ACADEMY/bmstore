'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { useCart } from '@/lib/cart';
import { rupees } from '@/lib/money';
import { useLayout, useStore, useT } from '@/lib/store-context';
import { CheckIcon, TruckIcon } from './icons';
import { Placeholder } from './product-image';

/** The coupon chosen in the cart travels to checkout through localStorage (per store). */
export const couponKey = (slug: string) => `bm_coupon:${slug}`;

export function CartView() {
  const t = useT();
  const { store, settings } = useStore();
  const { layout } = useLayout();
  const { lines, ready, subtotal, count, setQty, remove } = useCart();
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { const c = localStorage.getItem(couponKey(store.slug)); if (c) setInput(c); } catch { /* ignore */ } }, [store.slug]);
  // re-validate a remembered coupon against the current cart (the server is the source of truth for money)
  useEffect(() => {
    if (!ready || !lines.length) return;
    let code: string | null = null;
    try { code = localStorage.getItem(couponKey(store.slug)); } catch { /* ignore */ }
    if (!code) { setCoupon(null); return; }
    let cancelled = false;
    api<{ discount: number; coupon: { code: string } | null }>('/quote', { method: 'POST', json: { items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })), couponCode: code, paymentMode: 'COD' } })
      .then((q) => { if (!cancelled) setCoupon(q.coupon ? { code: q.coupon.code, discount: q.discount } : null); })
      .catch(() => { if (!cancelled) { setCoupon(null); try { localStorage.removeItem(couponKey(store.slug)); } catch { /* ignore */ } } });
    return () => { cancelled = true; };
  }, [ready, lines, store.slug]);

  const apply = async () => {
    const code = input.trim().toUpperCase();
    if (!code) return;
    setBusy(true); setError(null);
    try {
      const q = await api<{ discount: number; coupon: { code: string } | null }>('/quote', { method: 'POST', json: { items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })), couponCode: code, paymentMode: 'COD' } });
      setCoupon(q.coupon ? { code: q.coupon.code, discount: q.discount } : null);
      try { localStorage.setItem(couponKey(store.slug), code); } catch { /* ignore */ }
    } catch (e) { setError(e instanceof ApiError ? e.message : t('error.generic')); setCoupon(null); }
    finally { setBusy(false); }
  };
  const removeCoupon = () => { setCoupon(null); setInput(''); try { localStorage.removeItem(couponKey(store.slug)); } catch { /* ignore */ } };

  if (!ready) return <div className="min-h-[40dvh]" aria-busy="true" />;
  if (!lines.length) {
    return (
      <div className="card p-10 text-center">
        {layout === 'v1-textile' ? <div className="zari mx-auto w-32 mb-6" aria-hidden /> : <div className="mx-auto mb-6 h-px w-16 bg-accent" aria-hidden />}
        <p className="text-ink-2">{t('cart.empty')}</p>
        <Link href="/c/all" className="btn-primary mt-6">{t('cart.continue')}</Link>
      </div>
    );
  }
  const after = Math.max(0, subtotal - (coupon?.discount ?? 0));
  const freeAbove = settings.shippingMode === 'FREE_ABOVE' ? settings.freeAbove : null;
  const progress = freeAbove ? Math.min(1, after / freeAbove) : null;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        {progress !== null && (
          <div className="card p-4 mb-4" role="status">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TruckIcon className={`h-5 w-5 shrink-0 ${progress >= 1 ? 'text-ok' : 'text-accent-text'}`} />
              <span>{progress >= 1 ? t('cart.freeDeliveryUnlocked') : t('cart.freeDeliveryProgress', { amount: rupees(freeAbove! - after) })}</span>
            </div>
            <div className="mt-2.5 h-2 rounded-pill bg-line overflow-hidden" aria-hidden><div className={`h-full rounded-pill transition-all ${progress >= 1 ? 'bg-ok' : 'bg-primary'}`} style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          </div>
        )}
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={`${l.productId}:${l.variantId}`} className="flex gap-4 py-4">
              <Link href={`/p/${l.slug}`} className={`relative shrink-0 overflow-hidden rounded-card bg-primary-soft ${layout === 'v1-textile' ? 'h-28 w-[88px]' : 'h-20 w-20'}`}>
                {l.image ? <Image src={l.image} alt="" fill sizes="88px" className="object-cover" /> : <Placeholder label={l.name} />}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/p/${l.slug}`} className="font-medium leading-snug line-clamp-2">{l.name}</Link>
                {l.variantLabel && <div className="text-sm text-ink-3 mt-0.5">{l.variantLabel}</div>}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-card border border-line bg-surface">
                    <button type="button" className="h-11 w-11 text-lg" aria-label={`${t('card.minus')}: ${l.name}`} onClick={() => setQty(l.productId, l.variantId, l.qty - 1)}>−</button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">{l.qty}</span>
                    <button type="button" className="h-11 w-11 text-lg disabled:opacity-40" aria-label={`${t('card.plus')}: ${l.name}`} onClick={() => setQty(l.productId, l.variantId, l.qty + 1)} disabled={l.qty >= (l.maxQty || 99)}>+</button>
                  </div>
                  <div className="font-semibold">{rupees(l.unitPrice * l.qty)}</div>
                </div>
                <button type="button" className="mt-1 h-9 text-xs text-ink-3 underline underline-offset-4 hover:text-bad" onClick={() => remove(l.productId, l.variantId)}>{t('cart.remove')}</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <aside className="card p-5 h-fit lg:sticky lg:top-24">
        <div className="flex justify-between text-sm text-ink-2"><span>{t('cart.items', { count })}</span></div>
        <div className="mt-2 flex justify-between text-lg font-semibold"><span>{t('cart.subtotal')}</span><span>{rupees(subtotal)}</span></div>
        {coupon && <div className="mt-1 flex justify-between text-sm text-ok"><span>{t('cart.couponApplied', { code: coupon.code })}</span><span>−{rupees(coupon.discount)}</span></div>}
        <div className="mt-4">
          <label className="label" htmlFor="cart-coupon">{t('checkout.coupon')}</label>
          {coupon ? (
            <div className="flex items-center justify-between rounded-card bg-accent-soft px-3 py-2.5">
              <span className="font-semibold text-primary-text inline-flex items-center gap-2 text-sm"><CheckIcon className="h-5 w-5" />{coupon.code}</span>
              <button type="button" className="h-9 text-sm underline underline-offset-4" onClick={removeCoupon}>{t('checkout.removeCoupon')}</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input id="cart-coupon" className="field uppercase h-11 min-h-11" value={input} onChange={(e) => { setInput(e.target.value.toUpperCase()); setError(null); }} placeholder="WELCOME10" />
              <button type="button" className="btn-outline h-11 min-h-11 px-4" disabled={!input.trim() || busy} onClick={apply}>{t('checkout.applyCoupon')}</button>
            </div>
          )}
          {error && <p className="mt-1 text-xs text-bad" role="alert">{error}</p>}
          {!coupon && !error && <p className="mt-1 text-xs text-ink-3">{t('cart.couponHint')}</p>}
        </div>
        <p className="mt-3 text-xs text-ink-3">{t('cart.shippingNote')}</p>
        <Link href="/checkout" className="btn-primary mt-5 w-full">{t('cart.checkout')}</Link>
        <Link href="/c/all" className="btn-ghost mt-2 w-full">{t('cart.continue')}</Link>
      </aside>
    </div>
  );
}
