'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useCart } from '@/lib/cart';
import { swatchColour } from '@/lib/colours';
import { rupees, pct } from '@/lib/money';
import { useLayout, useStore, useT } from '@/lib/store-context';
import { whatsappLink } from '@/lib/wa';
import { CheckIcon, WhatsAppIcon } from './icons';

export interface BuyProduct { id: string; name: string; slug: string; price: number; mrp: number; stock: number; sku: string | null; images: string[]; variants: Array<{ id: string; optionName: string; optionValue: string; priceDelta: number; stock: number; sku: string | null }> }

/**
 * Price, variant swatches/chips, stock state, quantity, add to cart and "Order on WhatsApp". Variants are one
 * dimension (each row is a purchasable unit, grouped by optionName for display). The server re-prices at checkout.
 */
export function BuyBox({ p, url }: { p: BuyProduct; url: string }) {
  const t = useT();
  const { store, payments, settings } = useStore();
  const { layout } = useLayout();
  const cart = useCart();
  const groups = useMemo(() => { const g = new Map<string, BuyProduct['variants']>(); for (const v of p.variants) g.set(v.optionName, [...(g.get(v.optionName) ?? []), v]); return [...g.entries()]; }, [p.variants]);
  const hasVariants = p.variants.length > 0;
  const firstAvailable = p.variants.find((v) => v.stock > 0) ?? null;
  // textile stores make the shopper pick a colour; a grocer preselects the base pack (one tap to add)
  const [variantId, setVariantId] = useState<string | null>(p.variants.length === 1 ? p.variants[0].id : firstAvailable && groups.length === 1 && (p.variants.length <= 2 || layout === 'v2-grocer') ? firstAvailable.id : null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const variant = p.variants.find((v) => v.id === variantId) ?? null;
  const price = p.price + (variant?.priceDelta ?? 0);
  const mrp = p.mrp + (variant?.priceDelta ?? 0);
  const stock = hasVariants ? (variant ? variant.stock : p.variants.reduce((n, v) => n + v.stock, 0)) : p.stock;
  const out = stock <= 0;
  const needsChoice = hasVariants && !variant;
  const label = variant ? ` (${variant.optionName}: ${variant.optionValue})` : '';
  const wa = whatsappLink(store.whatsappNumber, t('product.whatsappMessage', { name: p.name, variant: label, url }));
  const add = () => {
    cart.add({ productId: p.id, variantId: variant?.id ?? null, name: p.name, slug: p.slug, image: p.images[0] ?? null, unitPrice: price, variantLabel: variant ? `${variant.optionName}: ${variant.optionValue}` : null, maxQty: Math.min(stock, 20) }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };
  const off = pct(price, mrp);
  return (
    <div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-3xl font-semibold text-ink">{rupees(price)}</span>
        {mrp > price && <><span className="price-strike text-base">{t('product.mrp')} {rupees(mrp)}</span><span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-primary-text">{t('product.off', { pct: off })}</span></>}
      </div>
      <p className="mt-1 text-xs text-ink-3">{t('product.inclTax')}</p>

      {groups.map(([name, vs]) => (
        <fieldset key={name} className="mt-6">
          <legend className="label flex items-baseline gap-2">{t('product.selectOption', { name })}{variant?.optionName === name && <span className="text-ink font-semibold">{variant.optionValue}</span>}</legend>
          <div className="flex flex-wrap gap-2.5">
            {vs.map((v) => {
              const n = name.toLowerCase();
              const colour = n.includes('colour') || n.includes('color') || n.includes('finish') || name.includes('நிறம்') ? swatchColour(v.optionValue) : null;
              const on = v.id === variantId;
              const disabled = v.stock <= 0;
              return colour ? (
                <button key={v.id} type="button" onClick={() => { setVariantId(v.id); setQty(1); }} disabled={disabled} aria-pressed={on} aria-label={`${v.optionValue}${disabled ? ` (${t('product.outOfStock')})` : ''}`} title={v.optionValue}
                  className={`relative h-11 w-11 rounded-full border-2 transition ${on ? 'border-ink scale-105' : 'border-line'} ${disabled ? 'opacity-40' : ''}`} style={{ background: colour }}>
                  {on && <CheckIcon className="absolute inset-0 m-auto h-5 w-5" style={{ color: ['#ffffff', '#f7f1e3', '#f3e9d2', '#f4efe6', '#e5c8a6'].includes(colour) ? '#2b1b17' : '#fff' }} />}
                  {disabled && <span className="absolute inset-0 m-auto h-0.5 w-8 rotate-45 bg-ink/60 top-1/2 -translate-y-1/2" />}
                </button>
              ) : (
                <button key={v.id} type="button" onClick={() => { setVariantId(v.id); setQty(1); }} disabled={disabled} aria-pressed={on} className={`${on ? 'chip-on' : 'chip'} h-11 ${layout === 'v2-grocer' ? 'flex-col items-start justify-center h-14 px-3.5 leading-tight rounded-card' : ''} ${disabled ? 'opacity-40 line-through' : ''}`}>{v.optionValue}{layout === 'v2-grocer' ? <span className="text-xs opacity-75 font-normal">{rupees(p.price + v.priceDelta)}</span> : v.priceDelta ? <span className="ml-1 text-xs opacity-70">{v.priceDelta > 0 ? '+' : '−'}{rupees(Math.abs(v.priceDelta))}</span> : null}</button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="mt-5 text-sm font-medium" aria-live="polite">
        {out ? <span className="text-bad">{t('product.outOfStock')}</span> : stock <= settings.lowStockThreshold ? <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-soft text-accent-text px-2.5 py-1"><span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />{t('product.lowStock', { count: stock })}</span> : <span className="text-ok">{t('product.inStock')}</span>}
      </div>

      <div className="mt-5 flex gap-3">
        <div className="inline-flex items-center rounded-card border border-line bg-surface">
          <button type="button" className="tap w-12 text-xl" aria-label="−" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>−</button>
          <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
          <button type="button" className="tap w-12 text-xl" aria-label="+" onClick={() => setQty((q) => Math.min(Math.min(stock, 20), q + 1))} disabled={qty >= Math.min(stock, 20)}>+</button>
        </div>
        <button type="button" className={needsChoice && !out ? 'btn-outline flex-1 border-dashed !opacity-100 text-ink-2' : 'btn-primary flex-1'} disabled={out || needsChoice} onClick={add} aria-disabled={needsChoice || out}>{added ? <><CheckIcon className="h-5 w-5" />{t('product.added')}</> : needsChoice && !out ? t('product.chooseFirst', { name: groups[0]?.[0] ?? '' }) : t('product.addToCart')}</button>
      </div>
      {added && <Link href="/cart" className="btn-outline mt-3 w-full">{t('product.goToCart')}</Link>}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-wa mt-3 w-full"><WhatsAppIcon className="h-5 w-5" />{t('product.orderWhatsApp')}</a>}

      <ul className="mt-6 space-y-1.5 text-sm text-ink-2">
        {payments.cod && <li className="flex gap-2"><CheckIcon className="h-5 w-5 text-ok shrink-0" />{t('product.cod')}</li>}
        {payments.online && <li className="flex gap-2"><CheckIcon className="h-5 w-5 text-ok shrink-0" />{t('product.onlinePay')}</li>}
        {(variant?.sku ?? p.sku) && <li className="text-xs text-ink-3">{t('product.sku')}: {variant?.sku ?? p.sku}</li>}
      </ul>
    </div>
  );
}
