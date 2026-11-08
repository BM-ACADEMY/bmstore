/**
 * Theme defaults per layout. One set of layouts for every store (no client-specific CSS, ever): a store picks a layout
 * and its brand colours, nothing else. The storefront (apps/storefront) renders `layoutVariant` + these style ids.
 * Homepage sections never include reviews, ratings, testimonials or order counts (we do not invent social proof).
 */
export interface LayoutPreset {
  label: string;
  description: string;
  layoutVariant: string;
  paletteId: string;
  primaryColor: string;
  secondaryColor: string;
  fontPairId: string;
  headerStyle: string;
  cardStyle: string;
  homepageSections: Array<Record<string, unknown>>;
}

export const LAYOUTS: Record<string, LayoutPreset> = {
  classic: {
    label: 'Classic', description: 'Banner, categories, featured products. Fits most shops.',
    layoutVariant: 'classic', paletteId: 'classic', primaryColor: '#111827', secondaryColor: '#6B7280', fontPairId: 'modern', headerStyle: 'standard', cardStyle: 'standard',
    homepageSections: [{ type: 'hero' }, { type: 'categories' }, { type: 'featured-products', limit: 8 }, { type: 'about' }],
  },
  boutique: {
    label: 'Boutique', description: 'Large photos, serif headings. Sarees, jewellery, fashion.',
    layoutVariant: 'boutique', paletteId: 'warm', primaryColor: '#7C2D12', secondaryColor: '#B45309', fontPairId: 'elegant', headerStyle: 'centered', cardStyle: 'tall',
    homepageSections: [{ type: 'hero' }, { type: 'featured-products', limit: 6 }, { type: 'categories' }, { type: 'about' }],
  },
  grocery: {
    label: 'Grocery', description: 'Dense grid, quick add to cart. Groceries, daily needs.',
    layoutVariant: 'grocery', paletteId: 'fresh', primaryColor: '#166534', secondaryColor: '#CA8A04', fontPairId: 'friendly', headerStyle: 'search-first', cardStyle: 'compact',
    homepageSections: [{ type: 'categories' }, { type: 'featured-products', limit: 12 }, { type: 'about' }],
  },
  minimal: {
    label: 'Minimal', description: 'Few products, lots of space. Single-product brands, crafts.',
    layoutVariant: 'minimal', paletteId: 'mono', primaryColor: '#0F172A', secondaryColor: '#64748B', fontPairId: 'modern', headerStyle: 'minimal', cardStyle: 'borderless',
    homepageSections: [{ type: 'hero' }, { type: 'featured-products', limit: 4 }, { type: 'about' }],
  },
};

/** Suggested layout from the business category (used when the intake names no layout). */
export function layoutForCategory(category?: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (/saree|silk|jewel|fashion|boutique|cloth|apparel|textile/.test(c)) return 'boutique';
  if (/grocer|kirana|food|vegetable|daily|spice|provision/.test(c)) return 'grocery';
  if (/craft|art|handmade|single/.test(c)) return 'minimal';
  return 'classic';
}

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Theme row for a layout + the client's brand colours (first = primary, second = secondary). */
export function themeFor(layout: string, brandColors: readonly string[] = []) {
  const p = LAYOUTS[layout] ?? LAYOUTS.classic;
  const [c1, c2] = brandColors.filter((c) => HEX.test(c));
  return {
    layoutVariant: p.layoutVariant, paletteId: p.paletteId, fontPairId: p.fontPairId, headerStyle: p.headerStyle, cardStyle: p.cardStyle,
    primaryColor: (c1 ?? p.primaryColor).toUpperCase(), secondaryColor: (c2 ?? p.secondaryColor).toUpperCase(), homepageSections: p.homepageSections,
  };
}
