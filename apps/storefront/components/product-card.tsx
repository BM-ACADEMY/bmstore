'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { pct, rupees } from '@/lib/money';
import { useLayout, useStore, useT } from '@/lib/store-context';
import { CheckIcon } from './icons';
import { ProductImage } from './product-image';

export interface CardProduct { id: string; name: string; slug: string; price: number; mrp: number; stock: number; images: string[]; variants: Array<{ id?: string; stock: number; optionName: string; optionValue: string; priceDelta?: number }> }

export function inStock(p: CardProduct) { return p.variants.length ? p.variants.some((v) => v.stock > 0) : p.stock > 0; }
export function totalStock(p: CardProduct) { return p.variants.length ? p.variants.reduce((n, v) => n + v.stock, 0) : p.stock; }

/**
 * Product card in the three theme styles. `portrait` (lookbook: tall photo, quiet type), `compact` (dense grocery
 * card with a pack picker and an add / minus / plus stepper), `framed` (bordered retail card with price block and a
 * low-stock badge). No ratings, no counts: nothing we cannot stand behind.
 */
export function ProductCard({ p, priority = false, style }: { p: CardProduct; priority?: boolean; style?: 'portrait' | 'compact' | 'framed'; labels?: unknown }) {
  const { cardStyle } = useLayout();
  const s = style ?? cardStyle;
  if (s === 'compact') return <CompactCard p={p} priority={priority} />;
  if (s === 'framed') return <FramedCard p={p} priority={priority} />;
  return <PortraitCard p={p} priority={priority} />;
}

function useCardState(p: CardProduct) {
  const t = useT();
  const { settings } = useStore();
  const off = pct(p.price, p.mrp);
  const available = inStock(p);
  const stock = totalStock(p);
  const low = available && stock <= settings.lowStockThreshold;
  return { t, off, available, stock, low, optionCount: p.variants.length };
}

function PortraitCard({ p, priority }: { p: CardProduct; priority: boolean }) {
  const { t, off, available, low, stock, optionCount } = useCardState(p);
  return (
    <Link href={`/p/${p.slug}`} className="group block">
      <div className="relative aspect-saree overflow-hidden rounded-card bg-primary-soft">
        <ProductImage src={p.images[0]} alt={p.name} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className="transition duration-500 group-hover:scale-[1.03]" />
        {off > 0 && available && <span className="absolute left-2 top-2 rounded-pill bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-primary-text shadow-card">{t('product.off', { pct: off })}</span>}
        {!available && <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1.5 text-center text-xs font-semibold text-bg">{t('product.outOfStock')}</span>}
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="text-[15px] leading-snug text-ink line-clamp-2 min-h-[2.6em]">{p.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-semibold text-ink">{rupees(p.price)}</span>
          {p.mrp > p.price && <span className="text-sm price-strike">{rupees(p.mrp)}</span>}
        </div>
        {low ? <div className="mt-0.5 text-xs text-accent-text font-medium">{t('product.lowStock', { count: stock })}</div> : optionCount > 1 ? <div className="mt-0.5 text-xs text-ink-3">{t('product.options', { count: optionCount })}</div> : null}
      </div>
    </Link>
  );
}

function FramedCard({ p, priority }: { p: CardProduct; priority: boolean }) {
  const { t, off, available, low, stock, optionCount } = useCardState(p);
  return (
    <Link href={`/p/${p.slug}`} className="group card block overflow-hidden transition hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.35)]">
      <div className="relative aspect-square overflow-hidden bg-primary-soft">
        <ProductImage src={p.images[0]} alt={p.name} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className="transition duration-500 group-hover:scale-[1.04]" />
        {low && <span className="absolute left-2.5 top-2.5 rounded-pill bg-accent text-on-accent px-2.5 py-1 text-[11px] font-semibold">{t('product.lowStock', { count: stock })}</span>}
        {!low && off > 0 && available && <span className="absolute left-2.5 top-2.5 rounded-pill bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-primary-text">{t('product.off', { pct: off })}</span>}
        {!available && <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1.5 text-center text-xs font-semibold text-bg">{t('product.outOfStock')}</span>}
      </div>
      <div className="p-3.5">
        <div className="text-[15px] leading-snug text-ink line-clamp-2 min-h-[2.6em] font-medium">{p.name}</div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="text-[17px] font-semibold leading-none text-ink">{rupees(p.price)}</span>
          {p.mrp > p.price && <span className="text-xs price-strike">{rupees(p.mrp)}</span>}
        </div>
        {optionCount > 1 && <div className="mt-1.5 text-xs text-ink-3">{t('product.options', { count: optionCount })}</div>}
      </div>
    </Link>
  );
}

/** Dense grocery card: pack-size picker (when the product has <= 4 variants) and an add / − / + stepper that writes straight to the cart. */
function CompactCard({ p, priority }: { p: CardProduct; priority: boolean }) {
  const { t, off, available, low, optionCount } = useCardState(p);
  const cart = useCart();
  const withIds = p.variants.filter((v) => v.id) as Array<Required<CardProduct['variants'][number]>>;
  const pickable = withIds.length > 0 && withIds.length <= 4;
  const [variantId, setVariantId] = useState<string | null>(pickable ? (withIds.find((v) => v.stock > 0) ?? withIds[0]).id : null);
  const variant = withIds.find((v) => v.id === variantId) ?? null;
  const price = p.price + (variant?.priceDelta ?? 0);
  const mrp = p.mrp + (variant?.priceDelta ?? 0);
  const stock = pickable ? (variant?.stock ?? 0) : totalStock(p);
  const line = cart.lines.find((l) => l.productId === p.id && (l.variantId ?? null) === (pickable ? variantId : null));
  const qty = line?.qty ?? 0;
  const max = Math.min(stock, 20);
  const canAdd = cart.ready && stock > 0 && (!withIds.length || pickable);
  const add = (n: number) => {
    if (!variant && pickable) return;
    if (qty === 0) cart.add({ productId: p.id, variantId: variant?.id ?? null, name: p.name, slug: p.slug, image: p.images[0] ?? null, unitPrice: price, variantLabel: variant ? `${variant.optionName}: ${variant.optionValue}` : null, maxQty: max }, 1);
    else cart.setQty(p.id, variant?.id ?? null, qty + n);
  };
  return (
    <div className="card overflow-hidden flex flex-col">
      <Link href={`/p/${p.slug}`} className="relative block aspect-square overflow-hidden bg-primary-soft">
        <ProductImage src={p.images[0]} alt={p.name} sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw" priority={priority} />
        {off > 0 && available && <span className="absolute left-2 top-2 rounded-card bg-accent text-on-accent px-2 py-0.5 text-[11px] font-bold">{t('product.off', { pct: off })}</span>}
        {low && <span className="absolute right-2 top-2 rounded-card bg-surface/95 px-2 py-0.5 text-[11px] font-semibold text-accent-text">{t('product.lowStock', { count: stock })}</span>}
        {!available && <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[11px] font-semibold text-bg">{t('product.outOfStock')}</span>}
      </Link>
      <div className="p-2.5 pt-2 flex flex-col gap-2 flex-1">
        <Link href={`/p/${p.slug}`} className="block text-[14px] leading-snug text-ink line-clamp-2 min-h-11 font-medium">{p.name}</Link>
        {pickable ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={withIds[0].optionName}>
            {withIds.map((v) => (
              <button key={v.id} type="button" onClick={() => setVariantId(v.id)} disabled={v.stock <= 0} aria-pressed={v.id === variantId}
                className={`h-11 px-3 rounded-pill border text-[13px] font-medium ${v.id === variantId ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink-2'} ${v.stock <= 0 ? 'opacity-40 line-through' : ''}`}>{v.optionValue}</button>
            ))}
          </div>
        ) : optionCount > 0 ? <div className="text-xs text-ink-3">{t('product.options', { count: optionCount })}</div> : null}
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="leading-tight">
            <div className="font-bold text-ink text-[16px]">{rupees(price)}</div>
            {mrp > price && <div className="text-[11px] price-strike">{rupees(mrp)}</div>}
          </div>
          {canAdd ? (
            qty === 0 ? (
              <button type="button" onClick={() => add(1)} className="h-11 min-w-[76px] px-3 rounded-card bg-primary text-on-primary text-sm font-bold active:scale-[0.98]" aria-label={`${t('product.addToCart')}: ${p.name}`}>{t('card.add')}</button>
            ) : (
              <div className="inline-flex items-center h-11 rounded-card bg-primary text-on-primary font-bold" aria-live="polite">
                <button type="button" onClick={() => add(-1)} className="h-11 w-11 text-xl leading-none" aria-label={`${t('card.minus')}: ${p.name}`}>−</button>
                <span className="min-w-5 text-center text-sm tabular-nums">{qty}</span>
                <button type="button" onClick={() => add(1)} disabled={qty >= max} className="h-11 w-11 text-xl leading-none disabled:opacity-40" aria-label={`${t('card.plus')}: ${p.name}`}>+</button>
              </div>
            )
          ) : withIds.length > 4 ? (
            <Link href={`/p/${p.slug}`} className="h-11 px-3 inline-flex items-center rounded-card border border-primary text-primary-text text-sm font-semibold">{t('card.choose')}</Link>
          ) : (
            <span className="h-10 inline-flex items-center text-xs text-ink-3">{available ? '' : t('product.outOfStock')}</span>
          )}
        </div>
      </div>
      {qty > 0 && <div className="sr-only" aria-live="polite">{t('product.added')}</div>}
      <span className="hidden"><CheckIcon /></span>
    </div>
  );
}

/** Grid density follows the card style: compact grocery cards sit tighter and reach 5 columns on wide screens. */
export function ProductGrid({ children, style }: { children: React.ReactNode; style?: 'portrait' | 'compact' | 'framed' }) {
  const cls = style === 'compact'
    ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5'
    : style === 'framed'
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4'
      : 'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4';
  return <div className={cls}>{children}</div>;
}
