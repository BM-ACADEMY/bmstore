'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { rupees } from '@/lib/money';
import { useT } from '@/lib/store-context';
import { Placeholder } from './product-image';

export function CartView() {
  const t = useT();
  const { lines, ready, subtotal, count, setQty, remove } = useCart();
  if (!ready) return <div className="min-h-[40dvh]" aria-busy="true" />;
  if (!lines.length) {
    return (
      <div className="card p-10 text-center">
        <div className="zari mx-auto w-32 mb-6" aria-hidden />
        <p className="text-ink-2">{t('cart.empty')}</p>
        <Link href="/c/all" className="btn-primary mt-6">{t('cart.continue')}</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <li key={`${l.productId}:${l.variantId}`} className="flex gap-4 py-4">
            <Link href={`/p/${l.slug}`} className="relative h-28 w-[88px] shrink-0 overflow-hidden rounded-card bg-primary-soft">
              {l.image ? <Image src={l.image} alt="" fill sizes="88px" className="object-cover" /> : <Placeholder label={l.name} />}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/p/${l.slug}`} className="font-medium leading-snug line-clamp-2">{l.name}</Link>
              {l.variantLabel && <div className="text-sm text-ink-3 mt-0.5">{l.variantLabel}</div>}
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="inline-flex items-center rounded-card border border-line bg-surface">
                  <button type="button" className="h-10 w-10 text-lg" aria-label="−" onClick={() => setQty(l.productId, l.variantId, l.qty - 1)}>−</button>
                  <span className="w-7 text-center text-sm font-semibold">{l.qty}</span>
                  <button type="button" className="h-10 w-10 text-lg" aria-label="+" onClick={() => setQty(l.productId, l.variantId, l.qty + 1)} disabled={l.qty >= (l.maxQty || 99)}>+</button>
                </div>
                <div className="font-semibold">{rupees(l.unitPrice * l.qty)}</div>
              </div>
              <button type="button" className="mt-1 text-xs text-ink-3 underline underline-offset-4 hover:text-bad" onClick={() => remove(l.productId, l.variantId)}>{t('cart.remove')}</button>
            </div>
          </li>
        ))}
      </ul>
      <aside className="card p-5 h-fit lg:sticky lg:top-24">
        <div className="flex justify-between text-sm text-ink-2"><span>{t('cart.items', { count })}</span></div>
        <div className="mt-2 flex justify-between text-lg font-semibold"><span>{t('cart.subtotal')}</span><span>{rupees(subtotal)}</span></div>
        <p className="mt-1 text-xs text-ink-3">{t('cart.shippingNote')}</p>
        <Link href="/checkout" className="btn-primary mt-5 w-full">{t('cart.checkout')}</Link>
        <Link href="/c/all" className="btn-ghost mt-2 w-full">{t('cart.continue')}</Link>
      </aside>
    </div>
  );
}
