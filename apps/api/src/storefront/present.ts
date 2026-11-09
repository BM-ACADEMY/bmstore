import type { Category, Product, Variant } from '@prisma/client';

/** What the public storefront may know about a product. Never tenantId, never cost-side data. */
export interface PublicVariant { id: string; optionName: string; optionValue: string; priceDelta: number; stock: number; sku: string | null }
export interface PublicProduct {
  id: string; name: string; slug: string; description: string | null; price: number; mrp: number; stock: number; sku: string | null;
  images: string[]; hsnCode: string | null; createdAt: string;
  category: { id: string; name: string; slug: string } | null;
  variants: PublicVariant[];
}

export function presentVariant(v: Variant): PublicVariant {
  return { id: v.id, optionName: v.optionName, optionValue: v.optionValue, priceDelta: v.priceDelta, stock: v.stock, sku: v.sku };
}

export function presentProduct(p: Product & { variants?: Variant[]; category?: Pick<Category, 'id' | 'name' | 'slug'> | null }): PublicProduct {
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description, price: p.price, mrp: p.mrp, stock: p.stock, sku: p.sku,
    images: p.images, hsnCode: p.hsnCode, createdAt: p.createdAt.toISOString(),
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
    variants: (p.variants ?? []).map(presentVariant),
  };
}

export function presentCategory(c: Category & { productCount?: number }) {
  return { id: c.id, name: c.name, slug: c.slug, parentId: c.parentId, image: c.image, productCount: c.productCount ?? 0 };
}
