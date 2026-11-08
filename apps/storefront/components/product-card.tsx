import Link from 'next/link';
import { pct, rupees } from '@/lib/money';
import { ProductImage } from './product-image';

export interface CardProduct { id: string; name: string; slug: string; price: number; mrp: number; stock: number; images: string[]; variants: Array<{ stock: number; optionName: string; optionValue: string }> }

export function inStock(p: CardProduct) { return p.variants.length ? p.variants.some((v) => v.stock > 0) : p.stock > 0; }

/** Lookbook card: tall image, quiet type, price with MRP strike. No ratings, no counts: nothing we cannot stand behind. */
export function ProductCard({ p, priority = false, labels }: { p: CardProduct; priority?: boolean; labels: { off: (pct: number) => string; soldOut: string; options: (n: number) => string } }) {
  const off = pct(p.price, p.mrp);
  const available = inStock(p);
  const optionCount = p.variants.length;
  return (
    <Link href={`/p/${p.slug}`} className="group block">
      <div className="relative aspect-saree overflow-hidden rounded-card bg-primary-soft">
        <ProductImage src={p.images[0]} alt={p.name} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" priority={priority} className="transition duration-500 group-hover:scale-[1.03]" />
        {off > 0 && available && <span className="absolute left-2 top-2 rounded-full bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-primary-text shadow-card">{labels.off(off)}</span>}
        {!available && <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1.5 text-center text-xs font-semibold text-bg">{labels.soldOut}</span>}
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="text-[15px] leading-snug text-ink line-clamp-2 min-h-[2.6em]">{p.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-semibold text-ink">{rupees(p.price)}</span>
          {p.mrp > p.price && <span className="text-sm price-strike">{rupees(p.mrp)}</span>}
        </div>
        {optionCount > 1 && <div className="mt-0.5 text-xs text-ink-3">{labels.options(optionCount)}</div>}
      </div>
    </Link>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">{children}</div>;
}
