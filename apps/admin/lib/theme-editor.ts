'use client';

/**
 * Helpers for the theme editor. The storefront renders the owner's draft through a host-only cookie
 * (`bm_theme_preview`) it shares with the admin because both run on the store's hostname (different port in dev,
 * same host behind Caddy in production); colour-only changes are also posted to the preview iframe so they apply
 * without a reload. Nothing here touches the saved theme: that is the PUT /store/theme on "Save".
 */
export const PREVIEW_COOKIE = 'bm_theme_preview';

/** Where the shop itself is served for this store host. Override with NEXT_PUBLIC_STOREFRONT_ORIGIN ({host} = current hostname). */
export function storefrontOrigin(): string {
  const tpl = process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN;
  const host = location.hostname;
  if (tpl) return tpl.replace('{host}', host);
  if (host.endsWith('.localhost') || host === 'localhost') return `http://${host}:3002`;
  return `https://${host}`;
}

export function writePreviewCookie(draft: Record<string, unknown> | null) {
  // host-only on purpose (no Domain attribute): never Domain=.platform
  document.cookie = draft ? `${PREVIEW_COOKIE}=${encodeURIComponent(JSON.stringify(draft))}; path=/; max-age=${60 * 60 * 6}; samesite=lax` : `${PREVIEW_COOKIE}=; path=/; max-age=0`;
}

/** The draft the storefront needs for a preview: everything but the uploads in flight. Kept under the 4 KB cookie limit by trimming long About text. */
export function previewDraft(t: any): Record<string, unknown> {
  const sections = (t.homepageSections ?? []).map((s: any) => (s.type === 'about' ? { ...s, body: (s.body ?? '').slice(0, 600), bodyTa: (s.bodyTa ?? '').slice(0, 600) } : s));
  return { layoutVariant: t.layoutVariant, paletteId: t.paletteId, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor, fontPairId: t.fontPairId, headerStyle: t.headerStyle, cardStyle: t.cardStyle, heroType: t.heroType, logoUrl: t.logoUrl, bannerUrls: t.bannerUrls, homepageSections: sections, options: t.options };
}

/** Fields whose change needs a server re-render of the preview (everything else is a CSS variable). */
export const STRUCTURAL = ['layoutVariant', 'headerStyle', 'cardStyle', 'heroType', 'logoUrl', 'bannerUrls', 'homepageSections', 'options'];

// ---- contrast (same maths as the storefront) ------------------------------------------------------
const rgb = (c: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255] as const; };
const lum = (c: readonly [number, number, number]) => { const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
export function contrast(a: string, b: string): number {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return 1;
  const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}
export const isHex = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);

/** @font-face rules pointing at the storefront's self-hosted files, so the editor's font samples are the real faces. */
export function fontFaceCss(origin: string): string {
  const f = (family: string, file: string, weight: string, range?: string, style = 'normal') => `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:swap;src:url("${origin}/fonts/${file}") format("woff2");${range ? `unicode-range:${range};` : ''}}`;
  const TA = 'U+0964-0965, U+0B82-0BFA, U+200C-200D, U+20B9, U+25CC';
  const LA = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD';
  return [
    f('Inter', 'Inter.woff2', '100 900'), f('Playfair Display', 'PlayfairDisplay.woff2', '400 900'), f('Noto Sans Tamil', 'NotoSansTamil.woff2', '100 900'),
    f('Baloo Thambi 2', 'BalooThambi2-Tamil.woff2', '400 800', TA), f('Baloo Thambi 2', 'BalooThambi2-Latin.woff2', '400 800', LA),
    f('Cormorant Garamond', 'CormorantGaramond.woff2', '400 700', LA), f('Noto Serif Tamil', 'NotoSerifTamil-Tamil.woff2', '400 700', TA), f('Noto Serif Tamil', 'NotoSerifTamil-Latin.woff2', '400 700', LA),
  ].join('\n');
}
