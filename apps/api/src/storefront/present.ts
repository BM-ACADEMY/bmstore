import type { Category, Product, Variant } from '@prisma/client';

/** What the public storefront may know about a product. Never tenantId, never cost-side data. */
export interface PublicVariant { id: string; optionName: string; optionValue: string; priceDelta: number; stock: number; sku: string | null }
export interface PublicProduct {
  id: string; name: string; slug: string; description: string | null; price: number; mrp: number; stock: number; sku: string | null;
  images: string[]; hsnCode: string | null; createdAt: string;
  category: { id: string; name: string; slug: string } | null;
  variants: PublicVariant[];
}

const UNIT_G: Record<string, number> = { mg: 0.001, g: 1, gm: 1, gms: 1, kg: 1000, ml: 1, l: 1000, ltr: 1000, litre: 1000, pc: 1, pcs: 1 };
const SIZE_ORDER = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', '3xl', '4xl', 'free'];
/** Sort key for an option value: "250 g" < "500 g" < "1 kg", "2.4" < "2.6", S < M < L < XL; anything else keeps its position. */
function optionRank(value: string, index: number): number {
  const v = value.trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]+)?$/.exec(v);
  if (m) { const n = Number(m[1]); const unit = m[2] ? UNIT_G[m[2]] : 1; return unit !== undefined ? n * unit : index; }
  const i = SIZE_ORDER.indexOf(v);
  return i >= 0 ? i : index;
}
/** Variants grouped by option name, each group in natural order (the database has no position column). */
export function sortVariants<T extends { optionName: string; optionValue: string }>(vs: T[]): T[] {
  const byName = new Map<string, T[]>();
  for (const v of vs) byName.set(v.optionName, [...(byName.get(v.optionName) ?? []), v]);
  return [...byName.values()].flatMap((group) => group.map((v, i) => ({ v, k: optionRank(v.optionValue, i) })).sort((a, b) => a.k - b.k).map((x) => x.v));
}

export function presentVariant(v: Variant): PublicVariant {
  return { id: v.id, optionName: v.optionName, optionValue: v.optionValue, priceDelta: v.priceDelta, stock: v.stock, sku: v.sku };
}

export function presentProduct(p: Product & { variants?: Variant[]; category?: Pick<Category, 'id' | 'name' | 'slug'> | null }): PublicProduct {
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description, price: p.price, mrp: p.mrp, stock: p.stock, sku: p.sku,
    images: p.images, hsnCode: p.hsnCode, createdAt: p.createdAt.toISOString(),
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
    variants: sortVariants(p.variants ?? []).map(presentVariant),
  };
}

export function presentCategory(c: Category & { productCount?: number }) {
  return { id: c.id, name: c.name, nameTa: c.nameTa ?? null, slug: c.slug, parentId: c.parentId, image: c.image, productCount: c.productCount ?? 0 };
}
