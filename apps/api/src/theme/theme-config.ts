/**
 * Theme vocabulary and validation. The storefront (apps/storefront/lib/theme.ts) and the admin editor use the same
 * ids; this module is the source of truth for what a theme_configs row may contain. Everything a store can change
 * is a value from these lists (plus two hex colours and owner-supplied text / image URLs); the storefront turns the
 * row into CSS custom properties at request time, so no stylesheet is ever compiled per client.
 */
import { BadRequestException } from '@nestjs/common';

export const LAYOUTS = ['v1-textile', 'v2-grocer', 'v3-retail'] as const;
export type LayoutId = (typeof LAYOUTS)[number];
/**
 * Aliases: values written before Phase 4 and the developer console's own layout vocabulary (src/console/layouts.ts:
 * classic / boutique / grocery / minimal with their palette, font, header and card ids). They are accepted and stored
 * as written (the console's tests and intake rely on that) and mapped to the canonical layout when the row is read.
 */
const LAYOUT_ALIASES: Record<string, LayoutId> = { default: 'v1-textile', standard: 'v1-textile', boutique: 'v1-textile', grocery: 'v2-grocer', classic: 'v3-retail', minimal: 'v3-retail' };

export const PALETTES = ['v1-textile', 'v2-grocer', 'v3-jewel', 'classic', 'teal', 'indigo', 'forest', 'ocean', 'terracotta', 'plum', 'custom'] as const;
export type PaletteId = (typeof PALETTES)[number];
const PALETTE_ALIASES: Record<string, PaletteId> = { maroon: 'v1-textile', warm: 'terracotta', fresh: 'v2-grocer', mono: 'classic' };

/** All six pairs cover Tamil: either the face itself has a Tamil subset or Noto Sans Tamil completes it. */
export const FONT_PAIRS = ['playfair-inter', 'baloo-inter', 'cormorant-inter', 'noto-serif-tamil', 'modern', 'baloo'] as const;
export type FontPairId = (typeof FONT_PAIRS)[number];
const FONT_ALIASES: Record<string, FontPairId> = { serif: 'playfair-inter', elegant: 'playfair-inter', friendly: 'baloo-inter' };

export const HEADER_STYLES = ['standard', 'centered-logo', 'minimal'] as const;
const HEADER_ALIASES: Record<string, (typeof HEADER_STYLES)[number]> = { centered: 'centered-logo', 'search-first': 'standard' };
export const CARD_STYLES = ['portrait', 'compact', 'framed'] as const;
const CARD_ALIASES: Record<string, (typeof CARD_STYLES)[number]> = { standard: 'portrait', round: 'portrait', sharp: 'portrait', tall: 'portrait', borderless: 'portrait' };
export const HERO_TYPES = ['banner', 'slider', 'video'] as const;
export const CORNER_STYLES = ['soft', 'round', 'sharp'] as const;

/** Homepage sections the owner can order and toggle. No testimonials / social feeds: nothing we cannot stand behind. */
export const SECTION_TYPES = ['offer_strip', 'hero', 'categories', 'featured', 'bestsellers', 'about', 'contact'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
export const DEFAULT_SECTIONS: SectionType[] = ['offer_strip', 'hero', 'categories', 'featured', 'bestsellers', 'about', 'contact'];

export interface Section {
  type: SectionType;
  enabled: boolean;
  // hero
  tagline?: string | null; taglineTa?: string | null; ctaLabel?: string | null; ctaLabelTa?: string | null; ctaHref?: string | null;
  // offer_strip
  text?: string | null; textTa?: string | null; href?: string | null;
  // featured
  title?: string | null; titleTa?: string | null; productIds?: string[];
  // about
  body?: string | null; bodyTa?: string | null; imageUrl?: string | null;
}

export interface ThemeOptions {
  corners: (typeof CORNER_STYLES)[number];
  /** Visible theme/colour switcher for visitors (demo stores). */
  switcherEnabled: boolean;
  /** Hero video (https URL to an mp4/webm the owner hosts); banners[0] is the poster. */
  heroVideoUrl: string | null;
  /** Show the Tamil category label under the English one on tiles (V2 default) */
  bilingualLabels: boolean;
}

export interface ThemeConfigInput {
  layoutVariant?: unknown; paletteId?: unknown; primaryColor?: unknown; secondaryColor?: unknown; fontPairId?: unknown;
  headerStyle?: unknown; cardStyle?: unknown; heroType?: unknown; logoUrl?: unknown; bannerUrls?: unknown; homepageSections?: unknown; options?: unknown;
}
export interface NormalizedTheme {
  layoutVariant: LayoutId; paletteId: PaletteId; primaryColor: string; secondaryColor: string; fontPairId: FontPairId;
  headerStyle: (typeof HEADER_STYLES)[number]; cardStyle: (typeof CARD_STYLES)[number]; heroType: (typeof HERO_TYPES)[number];
  logoUrl: string | null; bannerUrls: string[]; homepageSections: Section[]; options: ThemeOptions;
}

export class ThemeValidationError extends BadRequestException {
  constructor(readonly problems: string[]) { super(problems); this.message = problems.join('. '); }
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_TEXT = 300;
const MAX_BODY = 2000;

const str = (v: unknown, max: number, field: string, problems: string[]): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') { problems.push(`${field} must be text`); return null; }
  if (v.length > max) { problems.push(`${field} is longer than ${max} characters`); return null; }
  return v;
};
const url = (v: unknown, field: string, problems: string[], schemes = ['http:', 'https:']): string | null => {
  const s = str(v, 500, field, problems);
  if (s === null) return null;
  try { const u = new URL(s); if (!schemes.includes(u.protocol)) throw new Error(); } catch { problems.push(`${field} must be a valid ${schemes.join('/')} URL`); return null; }
  return s;
};
/** Internal link (/c/sarees) or an absolute http(s) URL; nothing executable. */
const href = (v: unknown, field: string, problems: string[]): string | null => {
  const s = str(v, 500, field, problems);
  if (s === null) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return url(s, field, problems);
};
const pick = <T extends readonly string[]>(v: unknown, list: T, aliases: Record<string, T[number]>, fallback: T[number], field: string, problems: string[], canonical = true): T[number] => {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v !== 'string') { problems.push(`${field} must be one of ${list.join(', ')}`); return fallback; }
  if ((list as readonly string[]).includes(v)) return v as T[number];
  if (aliases[v]) return canonical ? aliases[v] : (v as T[number]);
  problems.push(`${field} must be one of ${list.join(', ')}`);
  return fallback;
};

/** Validate one homepage section; unknown types and unknown keys are dropped, text is bounded. */
export function normalizeSection(raw: unknown, problems: string[]): Section | null {
  if (!raw || typeof raw !== 'object') { problems.push('homepageSections entries must be objects'); return null; }
  const r = raw as Record<string, unknown>;
  const SECTION_ALIASES: Record<string, SectionType> = { 'featured-products': 'featured' }; // developer console presets (src/console/layouts.ts)
  const typeRaw = typeof r.type === 'string' ? (SECTION_ALIASES[r.type] ?? r.type) : '';
  if (!(SECTION_TYPES as readonly string[]).includes(typeRaw)) { problems.push(`unknown section type ${String(r.type).slice(0, 30)}`); return null; }
  const type = typeRaw as SectionType;
  const s: Section = { type, enabled: r.enabled === undefined ? true : Boolean(r.enabled) };
  const f = `${type}.`;
  if (type === 'hero') { s.tagline = str(r.tagline, MAX_TEXT, f + 'tagline', problems); s.taglineTa = str(r.taglineTa, MAX_TEXT, f + 'taglineTa', problems); s.ctaLabel = str(r.ctaLabel, 60, f + 'ctaLabel', problems); s.ctaLabelTa = str(r.ctaLabelTa, 60, f + 'ctaLabelTa', problems); s.ctaHref = href(r.ctaHref, f + 'ctaHref', problems); }
  if (type === 'offer_strip') { s.text = str(r.text, MAX_TEXT, f + 'text', problems); s.textTa = str(r.textTa, MAX_TEXT, f + 'textTa', problems); s.href = href(r.href, f + 'href', problems); }
  if (type === 'featured') {
    s.title = str(r.title, 80, f + 'title', problems); s.titleTa = str(r.titleTa, 80, f + 'titleTa', problems);
    const ids = Array.isArray(r.productIds) ? r.productIds : [];
    if (ids.length > 24) problems.push('featured.productIds: at most 24 products');
    s.productIds = ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 24);
  }
  if (type === 'about') { s.title = str(r.title, 80, f + 'title', problems); s.titleTa = str(r.titleTa, 80, f + 'titleTa', problems); s.body = str(r.body, MAX_BODY, f + 'body', problems); s.bodyTa = str(r.bodyTa, MAX_BODY, f + 'bodyTa', problems); s.imageUrl = url(r.imageUrl, f + 'imageUrl', problems); }
  return s;
}

/** Ordered, de-duplicated sections; every known type appears exactly once (missing ones appended, `about` disabled unless it has content). */
export function normalizeSections(raw: unknown, problems: string[]): Section[] {
  const out: Section[] = [];
  if (raw !== undefined && raw !== null && !Array.isArray(raw)) problems.push('homepageSections must be a list');
  for (const item of Array.isArray(raw) ? raw : []) {
    const s = normalizeSection(item, problems);
    if (s && !out.some((x) => x.type === s.type)) out.push(s);
  }
  for (const type of DEFAULT_SECTIONS) if (!out.some((x) => x.type === type)) out.push({ type, enabled: type !== 'about' });
  for (const s of out) if (s.type === 'about' && !s.body && !s.bodyTa) s.enabled = false;
  return out;
}

export function normalizeOptions(raw: unknown, problems: string[]): ThemeOptions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) problems.push('options must be an object');
  return {
    corners: pick(r.corners, CORNER_STYLES, {}, 'soft', 'options.corners', problems),
    switcherEnabled: Boolean(r.switcherEnabled),
    heroVideoUrl: url(r.heroVideoUrl, 'options.heroVideoUrl', problems, ['https:']),
    bilingualLabels: r.bilingualLabels === undefined ? true : Boolean(r.bilingualLabels),
  };
}

/**
 * Validate and normalise a full theme. `base` supplies the values for fields the input leaves out (a PUT may be
 * partial). Throws ThemeValidationError (400) listing every problem at once, so the editor can show them all.
 */
export function normalizeTheme(input: ThemeConfigInput, base?: Partial<NormalizedTheme> | null, opts: { canonical?: boolean } = {}): NormalizedTheme {
  const canonical = opts.canonical ?? true; // false = keep accepted alias ids as written (storage); true = map them (read side)
  const problems: string[] = [];
  const v = <K extends keyof ThemeConfigInput>(k: K) => (input[k] === undefined ? (base as any)?.[k] : input[k]);
  const colour = (x: unknown, field: string, fallback: string) => {
    if (x === undefined || x === null || x === '') return fallback;
    if (typeof x !== 'string' || !HEX.test(x)) { problems.push(`${field} must be a 6-digit hex colour like #7A1F2B`); return fallback; }
    return x;
  };
  const bannersRaw = v('bannerUrls');
  const banners: string[] = [];
  if (bannersRaw !== undefined && bannersRaw !== null) {
    if (!Array.isArray(bannersRaw)) problems.push('bannerUrls must be a list');
    else { if (bannersRaw.length > 10) problems.push('bannerUrls: at most 10 banners'); for (const b of bannersRaw.slice(0, 10)) { const u = url(b, 'bannerUrls', problems); if (u) banners.push(u); } }
  }
  const heroType = pick(v('heroType'), HERO_TYPES, {}, 'banner', 'heroType', problems);
  // options is a bag: a partial PUT merges over the stored options rather than replacing them
  const baseOptions = (base as any)?.options && typeof (base as any).options === 'object' ? (base as any).options : {};
  const options = normalizeOptions(input.options && typeof input.options === 'object' && !Array.isArray(input.options) ? { ...baseOptions, ...(input.options as object) } : v('options'), problems);
  if (heroType === 'video' && !options.heroVideoUrl) problems.push('heroType video needs options.heroVideoUrl');
  const theme: NormalizedTheme = {
    layoutVariant: pick(v('layoutVariant'), LAYOUTS, LAYOUT_ALIASES, 'v1-textile', 'layoutVariant', problems, canonical),
    paletteId: pick(v('paletteId'), PALETTES, PALETTE_ALIASES, 'v1-textile', 'paletteId', problems, canonical),
    primaryColor: colour(v('primaryColor'), 'primaryColor', '#7A1F2B'),
    secondaryColor: colour(v('secondaryColor'), 'secondaryColor', '#C9973B'),
    fontPairId: pick(v('fontPairId'), FONT_PAIRS, FONT_ALIASES, 'playfair-inter', 'fontPairId', problems, canonical),
    headerStyle: pick(v('headerStyle'), HEADER_STYLES, HEADER_ALIASES, 'standard', 'headerStyle', problems, canonical),
    cardStyle: pick(v('cardStyle'), CARD_STYLES, CARD_ALIASES, 'portrait', 'cardStyle', problems, canonical),
    heroType,
    logoUrl: url(v('logoUrl'), 'logoUrl', problems),
    bannerUrls: banners,
    homepageSections: normalizeSections(v('homepageSections'), problems),
    options,
  };
  if (problems.length) throw new ThemeValidationError(problems);
  return theme;
}

/** Read-side normalisation for rows written before Phase 4 (never throws: unknown values fall back to defaults). */
export function presentTheme(raw: Record<string, unknown>): NormalizedTheme {
  const row: Record<string, unknown> = { ...raw };
  // Phase 3 stored the corner choice in cardStyle ("round" / "sharp"); carry it into options.corners.
  if ((row.cardStyle === 'round' || row.cardStyle === 'sharp') && !(row.options as any)?.corners) row.options = { ...((row.options as object) ?? {}), corners: row.cardStyle };
  try { return normalizeTheme(row as ThemeConfigInput); }
  catch {
    const safe: ThemeConfigInput = {};
    for (const k of Object.keys(row) as (keyof ThemeConfigInput)[]) {
      try { normalizeTheme({ [k]: row[k] }); safe[k] = row[k]; } catch { /* drop the bad field */ }
    }
    return normalizeTheme(safe);
  }
}

// ---- editor vocabulary (what the admin shows; colours mirror apps/storefront/lib/theme.ts) --------------------------
export const PALETTE_PRESETS: Array<{ id: PaletteId; name: string; nameTa: string; bg: string; ink: string; primary: string; secondary: string; tertiary: string }> = [
  { id: 'v1-textile', name: 'Kanchi silk', nameTa: 'காஞ்சி பட்டு', bg: '#FBF5EA', ink: '#2B1B17', primary: '#7A1F2B', secondary: '#C9973B', tertiary: '#C9973B' },
  { id: 'v2-grocer', name: 'Market green', nameTa: 'சந்தை பச்சை', bg: '#FFF8E7', ink: '#1C2A1F', primary: '#1F6B3A', secondary: '#C8381F', tertiary: '#E3A51F' },
  { id: 'v3-jewel', name: 'Ink & rose', nameTa: 'மை & ரோஜா', bg: '#FBF7F2', ink: '#1D1A26', primary: '#1D1A26', secondary: '#8E4A55', tertiary: '#B89A7A' },
  { id: 'classic', name: 'Classic', nameTa: 'கிளாசிக்', bg: '#F7F7F5', ink: '#111827', primary: '#111827', secondary: '#6B7280', tertiary: '#9CA3AF' },
  { id: 'teal', name: 'Teal', nameTa: 'டீல்', bg: '#F4F7F6', ink: '#13231F', primary: '#0F766E', secondary: '#C9731A', tertiary: '#E0B04A' },
  { id: 'indigo', name: 'Indigo', nameTa: 'இண்டிகோ', bg: '#F5F5FA', ink: '#1C1B33', primary: '#3730A3', secondary: '#DB2777', tertiary: '#F0B429' },
  { id: 'forest', name: 'Forest', nameTa: 'காடு', bg: '#F5F7F2', ink: '#172116', primary: '#14532D', secondary: '#CA8A04', tertiary: '#9A6B3A' },
  { id: 'ocean', name: 'Ocean', nameTa: 'கடல்', bg: '#F3F7FA', ink: '#0F2233', primary: '#0B4F7A', secondary: '#D97706', tertiary: '#5EAFD6' },
  { id: 'terracotta', name: 'Terracotta', nameTa: 'செங்கல்', bg: '#FBF4EE', ink: '#2C1A12', primary: '#9A3B1E', secondary: '#2F5D50', tertiary: '#E0A458' },
  { id: 'plum', name: 'Plum', nameTa: 'பிளம்', bg: '#F8F4F8', ink: '#241526', primary: '#5B2A5E', secondary: '#B9975B', tertiary: '#D98CA6' },
];
export const FONT_PAIR_PRESETS: Array<{ id: FontPairId; name: string; heading: string; body: string; sample: string }> = [
  { id: 'playfair-inter', name: 'Playfair Display + Inter', heading: '"Playfair Display", serif', body: 'Inter, sans-serif', sample: 'Lookbook serif, quiet sans' },
  { id: 'baloo-inter', name: 'Baloo Thambi 2 + Inter', heading: '"Baloo Thambi 2", sans-serif', body: 'Inter, sans-serif', sample: 'Friendly rounded Tamil display' },
  { id: 'cormorant-inter', name: 'Cormorant Garamond + Inter', heading: '"Cormorant Garamond", serif', body: 'Inter, sans-serif', sample: 'Fine jewellery serif' },
  { id: 'noto-serif-tamil', name: 'Noto Serif Tamil + Noto Sans Tamil', heading: '"Noto Serif Tamil", serif', body: '"Noto Sans Tamil", Inter, sans-serif', sample: 'Tamil-first serif and sans' },
  { id: 'modern', name: 'Inter everywhere', heading: 'Inter, sans-serif', body: 'Inter, sans-serif', sample: 'Plain, modern, no serifs' },
  { id: 'baloo', name: 'Baloo Thambi 2 everywhere', heading: '"Baloo Thambi 2", sans-serif', body: '"Baloo Thambi 2", sans-serif', sample: 'Rounded and warm throughout' },
];
export const LAYOUT_PRESETS: Array<{ id: LayoutId; name: string; nameTa: string; description: string; palette: PaletteId; fontPair: FontPairId; cardStyle: (typeof CARD_STYLES)[number]; headerStyle: (typeof HEADER_STYLES)[number] }> = [
  { id: 'v1-textile', name: 'Fashion / Textile', nameTa: 'ஆடை / ஜவுளி', description: 'Lookbook: tall photos, category circles, quiet type. Sarees, kurtas, boutiques.', palette: 'v1-textile', fontPair: 'playfair-inter', cardStyle: 'portrait', headerStyle: 'centered-logo' },
  { id: 'v2-grocer', name: 'Food / Grocery', nameTa: 'உணவு / மளிகை', description: 'Category-first: two-column tiles, dense grid, add / − / + on the card, sticky cart bar. Staples, snacks, sweets.', palette: 'v2-grocer', fontPair: 'baloo-inter', cardStyle: 'compact', headerStyle: 'standard' },
  { id: 'v3-retail', name: 'General retail / Jewellery', nameTa: 'பொது விற்பனை / நகை', description: 'Feature blocks: full-width banner, trust strip, shop-by-style tiles, framed cards. Jewellery, gifts, electronics.', palette: 'v3-jewel', fontPair: 'cormorant-inter', cardStyle: 'framed', headerStyle: 'minimal' },
];
export const SECTION_LABELS: Record<SectionType, { name: string; hint: string }> = {
  offer_strip: { name: 'Offer strip', hint: 'One line above the hero; shows your delivery rule when empty' },
  hero: { name: 'Hero', hint: 'Banner, slider or video with your tagline' },
  categories: { name: 'Categories', hint: 'Your categories as circles / tiles' },
  featured: { name: 'Featured', hint: 'Newest products, or the ones you pick' },
  bestsellers: { name: 'Bestsellers', hint: 'From real orders in the last 90 days; hidden until there are sales' },
  about: { name: 'About', hint: 'Your own words and a photo' },
  contact: { name: 'Contact', hint: 'Address, delivery rule, call and WhatsApp' },
};

/** Everything the editor needs to draw its controls. */
export function themeVocabulary() {
  return {
    layouts: LAYOUT_PRESETS, palettes: PALETTE_PRESETS, fontPairs: FONT_PAIR_PRESETS,
    headerStyles: [{ id: 'standard', name: 'Standard', hint: 'Name on the left, search and cart on the right' }, { id: 'centered-logo', name: 'Centered logo', hint: 'Logo and name in the middle' }, { id: 'minimal', name: 'Minimal', hint: 'Thin bar, monogram when there is no logo' }],
    cardStyles: [{ id: 'portrait', name: 'Portrait', hint: 'Tall photo, quiet type (lookbook)' }, { id: 'compact', name: 'Compact', hint: 'Dense, pack picker and add / − / + on the card' }, { id: 'framed', name: 'Framed', hint: 'Bordered card, price block, low-stock badge' }],
    heroTypes: [{ id: 'banner', name: 'Single banner' }, { id: 'slider', name: 'Slider (all banners)' }, { id: 'video', name: 'Video (your own mp4 link)' }],
    corners: [{ id: 'soft', name: 'Soft' }, { id: 'round', name: 'Round' }, { id: 'sharp', name: 'Sharp' }],
    sections: SECTION_TYPES.map((id) => ({ id, ...SECTION_LABELS[id] })),
  };
}
