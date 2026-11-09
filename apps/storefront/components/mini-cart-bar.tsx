'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { rupees } from '@/lib/money';
import { useT } from '@/lib/store-context';
import { BagIcon } from './icons';

/** Sticky bottom bar on phones: "4 items · ₹395 · View cart". Hidden on the cart / checkout pages and when the cart is empty. */
export function MiniCartBar() {
  const t = useT();
  const path = usePathname();
  const { count, subtotal, ready } = useCart();
  if (!ready || count === 0 || path.startsWith('/cart') || path.startsWith('/checkout') || path.startsWith('/order')) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <Link href="/cart" className="flex items-center justify-between gap-3 h-14 rounded-card-lg bg-primary text-on-primary pl-4 pr-2 shadow-[0_12px_30px_-12px_rgb(0_0_0/0.45)] active:scale-[0.99] transition" aria-label={`${t('cart.items', { count })} · ${rupees(subtotal)} · ${t('cart.view')}`}>
        <span className="inline-flex items-center gap-2.5 text-sm font-semibold"><BagIcon className="h-5 w-5" />{t('cart.items', { count })}<span aria-hidden>·</span><span className="tabular-nums">{rupees(subtotal)}</span></span>
        <span className="inline-flex items-center h-10 px-4 rounded-card bg-bg text-ink text-sm font-bold">{t('cart.view')} ›</span>
      </Link>
    </div>
  );
}
