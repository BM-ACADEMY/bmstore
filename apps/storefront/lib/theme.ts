/**
 * Theme engine. Every colour, font and shape the storefront uses is a CSS custom property set on <html> from the
 * store's theme_configs row at request time (app/layout.tsx -> themeVars). Palette / font-pair / layout ids are
 * platform presets mirrored from apps/api/src/theme/theme-config.ts (the validating side); primaryColor and
 * secondaryColor from the row always win over the preset. Nothing here is client-specific and no stylesheet is
 * compiled per store: the single Tailwind build reads these variables.
 */
export const LAYOUTS = ['v1-textile', 'v2-grocer', 'v3-retail'] as const;
export type LayoutId = (typeof LAYOUTS)[number];
export const HEADER_STYLES = ['standard', 'centered-logo', 'minimal'] as const;
export const CARD_STYLES = ['portrait', 'compact', 'framed'] as const;
export const HERO_TYPES = ['banner', 'slider', 'video'] as const;
export const CORNERS = ['soft', 'round', 'sharp'] as const;
export const SECTION_TYPES = ['offer_strip', 'hero', 'categories', 'featured', 'bestsellers', 'about', 'contact'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export interface ThemeSection { type: SectionType; enabled: boolean; [k: string]: unknown }
export interface ThemeOptions { corners: (typeof CORNERS)[number]; switcherEnabled: boolean; heroVideoUrl: string | null; bilingualLabels: boolean }
export interface ThemeRow {
  layoutVariant: string; paletteId: string; primaryColor: string; secondaryColor: string; fontPairId: string;
  headerStyle: string; cardStyle: string; heroType: string; logoUrl: string | null; bannerUrls: string[];
  homepageSections: ThemeSection[]; options: ThemeOptions;
}

export interface Palette {
  id: string; name: string; nameTa: string;
  bg: string; surface: string; ink: string; ink2: string; ink3: string; line: string;
  primary: string; secondary: string; tertiary: string;
}

/**
 * Curated palettes. The first three are the layout "house" palettes; any palette works with any layout.
 * ink3 is the lightest text colour and is kept at >= 4.5:1 on bg; secondary/tertiary are decoration (borders,
 * badges, rings) unless themeVars finds them readable as text.
 */
export const PALETTES: Record<string, Palette> = {
  'v1-textile': { id: 'v1-textile', name: 'Kanchi silk', nameTa: 'காஞ்சி பட்டு', bg: '#FBF5EA', surface: '#FFFCF5', ink: '#2B1B17', ink2: '#5B4A45', ink3: '#6B5E58', line: '#E8DCC8', primary: '#7A1F2B', secondary: '#C9973B', tertiary: '#C9973B' },
  'v2-grocer': { id: 'v2-grocer', name: 'Market green', nameTa: 'சந்தை பச்சை', bg: '#FFF8E7', surface: '#FFFFFF', ink: '#1C2A1F', ink2: '#44554A', ink3: '#5C6B61', line: '#EADFC8', primary: '#1F6B3A', secondary: '#C8381F', tertiary: '#E3A51F' },
  'v3-jewel': { id: 'v3-jewel', name: 'Ink & rose', nameTa: 'மை & ரோஜா', bg: '#FBF7F2', surface: '#FFFFFF', ink: '#1D1A26', ink2: '#4A4553', ink3: '#625C6B', line: '#E9E1D8', primary: '#1D1A26', secondary: '#8E4A55', tertiary: '#B89A7A' },
  classic: { id: 'classic', name: 'Classic', nameTa: 'கிளாசிக்', bg: '#F7F7F5', surface: '#FFFFFF', ink: '#111827', ink2: '#4B5563', ink3: '#5F6975', line: '#E5E7EB', primary: '#111827', secondary: '#6B7280', tertiary: '#9CA3AF' },
  teal: { id: 'teal', name: 'Teal', nameTa: 'டீல்', bg: '#F4F7F6', surface: '#FFFFFF', ink: '#13231F', ink2: '#3F5651', ink3: '#5C6F6A', line: '#D9E4E1', primary: '#0F766E', secondary: '#C9731A', tertiary: '#E0B04A' },
  indigo: { id: 'indigo', name: 'Indigo', nameTa: 'இண்டிகோ', bg: '#F5F5FA', surface: '#FFFFFF', ink: '#1C1B33', ink2: '#4A4869', ink3: '#64627F', line: '#E0E0EC', primary: '#3730A3', secondary: '#DB2777', tertiary: '#F0B429' },
  forest: { id: 'forest', name: 'Forest', nameTa: 'காடு', bg: '#F5F7F2', surface: '#FFFFFF', ink: '#172116', ink2: '#3F4D3D', ink3: '#5E6B5B', line: '#DCE3D6', primary: '#14532D', secondary: '#CA8A04', tertiary: '#9A6B3A' },
  ocean: { id: 'ocean', name: 'Ocean', nameTa: 'கடல்', bg: '#F3F7FA', surface: '#FFFFFF', ink: '#0F2233', ink2: '#3E5366', ink3: '#5A6E80', line: '#D8E3EC', primary: '#0B4F7A', secondary: '#D97706', tertiary: '#5EAFD6' },
  terracotta: { id: 'terracotta', name: 'Terracotta', nameTa: 'செங்கல்', bg: '#FBF4EE', surface: '#FFFFFF', ink: '#2C1A12', ink2: '#5B4436', ink3: '#705A4E', line: '#EBD9CB', primary: '#9A3B1E', secondary: '#2F5D50', tertiary: '#E0A458' },
  plum: { id: 'plum', name: 'Plum', nameTa: 'பிளம்', bg: '#F8F4F8', surface: '#FFFFFF', ink: '#241526', ink2: '#52405A', ink3: '#6B5C72', line: '#E6DBE7', primary: '#5B2A5E', secondary: '#B9975B', tertiary: '#D98CA6' },
};
export const PALETTE_IDS = Object.keys(PALETTES);
/** Neutrals used when the owner picks "custom" colours: warm, quiet, works under any primary. */
const CUSTOM_BASE: Palette = { id: 'custom', name: 'Custom', nameTa: 'தனிப்பயன்', bg: '#F8F6F2', surface: '#FFFFFF', ink: '#1F1D1A', ink2: '#4D4944', ink3: '#625D57', line: '#E6E1D8', primary: '#111827', secondary: '#6B7280', tertiary: '#9CA3AF' };

export interface FontPair { id: string; name: string; heading: string; body: string; sample: string; headingScale: number }
/** Font pairs; files are self-hosted (public/fonts). All six render Tamil: the face has a Tamil subset or Noto Sans Tamil completes the stack. */
export const FONT_PAIRS: Record<string, FontPair> = {
  'playfair-inter': { id: 'playfair-inter', name: 'Playfair Display + Inter', heading: 'var(--font-playfair), "Playfair Display"', body: 'var(--font-inter), Inter', sample: 'Lookbook serif, quiet sans', headingScale: 1 },
  'baloo-inter': { id: 'baloo-inter', name: 'Baloo Thambi 2 + Inter', heading: '"Baloo Thambi 2"', body: 'var(--font-inter), Inter', sample: 'Friendly rounded Tamil display', headingScale: 0.96 },
  'cormorant-inter': { id: 'cormorant-inter', name: 'Cormorant Garamond + Inter', heading: '"Cormorant Garamond"', body: 'var(--font-inter), Inter', sample: 'Fine jewellery serif', headingScale: 1.12 },
  'noto-serif-tamil': { id: 'noto-serif-tamil', name: 'Noto Serif Tamil + Noto Sans Tamil', heading: '"Noto Serif Tamil"', body: 'var(--font-tamil), "Noto Sans Tamil", var(--font-inter)', sample: 'Tamil-first serif and sans', headingScale: 0.98 },
  modern: { id: 'modern', name: 'Inter everywhere', heading: 'var(--font-inter), Inter', body: 'var(--font-inter), Inter', sample: 'Plain, modern, no serifs', headingScale: 0.95 },
  baloo: { id: 'baloo', name: 'Baloo Thambi 2 everywhere', heading: '"Baloo Thambi 2"', body: '"Baloo Thambi 2"', sample: 'Rounded and warm throughout', headingScale: 0.96 },
};
export const FONT_PAIR_IDS = Object.keys(FONT_PAIRS);
const TAMIL = ', var(--font-tamil), "Noto Sans Tamil", "Latha", "Nirmala UI", system-ui, sans-serif';

// ---- colour maths --------------------------------------------------------------------------------
export const hexRgb = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec((c ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255] as const;
};
const lum = (rgb: readonly [number, number, number]) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};
/** WCAG contrast ratio of two hex colours (1..21). */
export function contrast(a: string, b: string): number {
  const x = hexRgb(a), y = hexRgb(b);
  if (!x || !y) return 1;
  const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}
export const mix = (c: string, to: string, k: number) => {
  const a = hexRgb(c)!, b = hexRgb(to)!;
  return '#' + [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k).toString(16).padStart(2, '0')).join('');
};
/** Darken (or lighten, on dark backgrounds) a colour until it reads at `ratio` on `bg`. */
export function readable(colour: string, bg: string, ratio = 4.5): string {
  let c = colour;
  const towards = lum(hexRgb(bg)!) > 0.4 ? '#000000' : '#ffffff';
  for (let i = 0; i < 12 && contrast(c, bg) < ratio; i++) c = mix(c, towards, 0.12);
  return c;
}

// ---- normalisation (read side) -------------------------------------------------------------------
export const layoutOf = (t: ThemeRow | null | undefined): LayoutId => ((LAYOUTS as readonly string[]).includes(t?.layoutVariant ?? '') ? (t!.layoutVariant as LayoutId) : 'v1-textile');
export const cardStyleOf = (t: ThemeRow | null | undefined) => ((CARD_STYLES as readonly string[]).includes(t?.cardStyle ?? '') ? (t!.cardStyle as (typeof CARD_STYLES)[number]) : 'portrait');
export const headerStyleOf = (t: ThemeRow | null | undefined) => ((HEADER_STYLES as readonly string[]).includes(t?.headerStyle ?? '') ? (t!.headerStyle as (typeof HEADER_STYLES)[number]) : 'standard');

export const DEFAULT_THEME: ThemeRow = {
  layoutVariant: 'v1-textile', paletteId: 'v1-textile', primaryColor: '#7A1F2B', secondaryColor: '#C9973B', fontPairId: 'playfair-inter',
  headerStyle: 'standard', cardStyle: 'portrait', heroType: 'banner', logoUrl: null, bannerUrls: [],
  homepageSections: SECTION_TYPES.map((type) => ({ type, enabled: type !== 'about' })),
  options: { corners: 'soft', switcherEnabled: false, heroVideoUrl: null, bilingualLabels: true },
};

/** Keys a browser-side preview (theme editor, demo switcher) may override through the host-only bm_theme_preview cookie. */
export const PREVIEW_KEYS = ['layoutVariant', 'paletteId', 'primaryColor', 'secondaryColor', 'fontPairId', 'headerStyle', 'cardStyle', 'heroType', 'homepageSections', 'options', 'bannerUrls', 'logoUrl'] as const;

/** Merge an untrusted draft over the stored theme: unknown ids and malformed values fall back to the stored row. */
export function mergePreview(base: ThemeRow, draft: unknown): ThemeRow {
  if (!draft || typeof draft !== 'object') return base;
  const d = draft as Record<string, unknown>;
  const out: ThemeRow = { ...base };
  const id = (v: unknown, list: readonly string[]) => (typeof v === 'string' && list.includes(v) ? v : null);
  const hex = (v: unknown) => (typeof v === 'string' && hexRgb(v) ? v.toUpperCase() : null);
  out.layoutVariant = id(d.layoutVariant, LAYOUTS) ?? base.layoutVariant;
  out.paletteId = id(d.paletteId, [...PALETTE_IDS, 'custom']) ?? base.paletteId;
  out.primaryColor = hex(d.primaryColor) ?? base.primaryColor;
  out.secondaryColor = hex(d.secondaryColor) ?? base.secondaryColor;
  out.fontPairId = id(d.fontPairId, FONT_PAIR_IDS) ?? base.fontPairId;
  out.headerStyle = id(d.headerStyle, HEADER_STYLES) ?? base.headerStyle;
  out.cardStyle = id(d.cardStyle, CARD_STYLES) ?? base.cardStyle;
  out.heroType = id(d.heroType, HERO_TYPES) ?? base.heroType;
  if (typeof d.logoUrl === 'string' || d.logoUrl === null) out.logoUrl = d.logoUrl && /^https?:\/\//.test(d.logoUrl) ? d.logoUrl : null;
  if (Array.isArray(d.bannerUrls)) out.bannerUrls = d.bannerUrls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 10);
  if (Array.isArray(d.homepageSections)) {
    const secs: ThemeSection[] = [];
    for (const s of d.homepageSections) {
      if (!s || typeof s !== 'object') continue;
      const type = id((s as any).type, SECTION_TYPES) as SectionType | null;
      if (!type || secs.some((x) => x.type === type)) continue;
      const clean: ThemeSection = { type, enabled: (s as any).enabled !== false };
      for (const [k, v] of Object.entries(s as Record<string, unknown>)) if (k !== 'type' && k !== 'enabled' && (typeof v === 'string' ? v.length <= 2000 : Array.isArray(v) || v === null)) clean[k] = v;
      secs.push(clean);
    }
    for (const type of SECTION_TYPES) if (!secs.some((x) => x.type === type)) secs.push(base.homepageSections.find((x) => x.type === type) ?? { type, enabled: type !== 'about' });
    out.homepageSections = secs;
  }
  if (d.options && typeof d.options === 'object') {
    const o = d.options as Record<string, unknown>;
    out.options = {
      corners: (id(o.corners, CORNERS) as ThemeOptions['corners'] | null) ?? base.options.corners,
      switcherEnabled: base.options.switcherEnabled, // never enabled from a cookie
      heroVideoUrl: typeof o.heroVideoUrl === 'string' && /^https:\/\//.test(o.heroVideoUrl) ? o.heroVideoUrl : o.heroVideoUrl === null ? null : base.options.heroVideoUrl,
      bilingualLabels: typeof o.bilingualLabels === 'boolean' ? o.bilingualLabels : base.options.bilingualLabels,
    };
  }
  return out;
}

// ---- CSS custom properties -------------------------------------------------------------------------
/**
 * The variables for <html>. Text-on-primary and primary-as-text are chosen for 4.5:1; soft tints are mixed from
 * the page background so a palette swap recolours every surface consistently.
 */
export function themeVars(t: ThemeRow | null): Record<string, string> {
  const row = t ?? DEFAULT_THEME;
  const p = PALETTES[row.paletteId] ?? (row.paletteId === 'custom' ? CUSTOM_BASE : PALETTES['v1-textile']);
  const primary = (hexRgb(row.primaryColor) ? row.primaryColor : p.primary).toLowerCase();
  const secondary = (hexRgb(row.secondaryColor) ? row.secondaryColor : p.secondary).toLowerCase();
  const tertiary = (PALETTES[row.paletteId] ? p.tertiary : secondary).toLowerCase();
  const onPrimary = contrast(primary, '#ffffff') >= 4.5 ? '#ffffff' : p.ink;
  const onSecondary = contrast(secondary, '#ffffff') >= 4.5 ? '#ffffff' : p.ink;
  const fonts = FONT_PAIRS[row.fontPairId] ?? FONT_PAIRS['playfair-inter'];
  const corners = row.options?.corners ?? 'soft';
  const radius = corners === 'sharp' ? '2px' : corners === 'round' ? '18px' : '10px';
  const radiusLg = corners === 'sharp' ? '4px' : corners === 'round' ? '28px' : '18px';
  const radiusPill = corners === 'sharp' ? '4px' : '999px';
  return {
    '--sf-bg': p.bg, '--sf-surface': p.surface, '--sf-ink': p.ink, '--sf-ink-2': p.ink2, '--sf-ink-3': readable(p.ink3, p.bg), '--sf-line': p.line,
    '--sf-primary': primary, '--sf-primary-text': readable(primary, p.bg), '--sf-on-primary': onPrimary,
    '--sf-primary-soft': mix(primary, p.bg, 0.9), '--sf-primary-deep': mix(primary, '#000000', 0.18),
    '--sf-accent': secondary, '--sf-accent-text': readable(secondary, p.bg), '--sf-on-accent': onSecondary, '--sf-accent-soft': mix(secondary, p.bg, 0.86),
    '--sf-tertiary': tertiary, '--sf-tertiary-soft': mix(tertiary, p.bg, 0.8),
    '--sf-font-heading': `${fonts.heading}${TAMIL}`, '--sf-font-body': `${fonts.body}${TAMIL}`, '--sf-heading-scale': String(fonts.headingScale),
    '--sf-radius': radius, '--sf-radius-lg': radiusLg, '--sf-radius-pill': radiusPill,
  };
}

/** Human-readable contrast report for the editor (and the tests): every text/background pair the layouts rely on. */
export function contrastReport(t: ThemeRow): Array<{ pair: string; ratio: number; ok: boolean }> {
  const v = themeVars(t);
  const pairs: Array<[string, string, string]> = [
    ['ink on bg', v['--sf-ink'], v['--sf-bg']], ['ink-2 on bg', v['--sf-ink-2'], v['--sf-bg']], ['ink-3 on bg', v['--sf-ink-3'], v['--sf-bg']],
    ['ink on surface', v['--sf-ink'], v['--sf-surface']], ['primary text on bg', v['--sf-primary-text'], v['--sf-bg']],
    ['text on primary button', v['--sf-on-primary'], v['--sf-primary']], ['text on accent badge', v['--sf-on-accent'], v['--sf-accent']],
    ['accent text on bg', v['--sf-accent-text'], v['--sf-bg']],
  ];
  return pairs.map(([pair, a, b]) => { const ratio = Math.round(contrast(a, b) * 100) / 100; return { pair, ratio, ok: ratio >= 4.5 }; });
}
