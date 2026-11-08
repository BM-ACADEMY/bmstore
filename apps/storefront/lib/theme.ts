/**
 * Theme vocabulary. Every colour, font and shape the storefront uses is a CSS custom property set from the store's
 * theme_configs row at request time; nothing here is client-specific. Palette/font-pair ids are platform presets a
 * store can pick in the admin; primaryColor / secondaryColor from the row always win over the preset.
 */
export interface ThemeRow {
  layoutVariant: string; paletteId: string; primaryColor: string; secondaryColor: string; fontPairId: string;
  headerStyle: string; cardStyle: string; logoUrl: string | null; bannerUrls: string[]; homepageSections: unknown;
}

interface Palette { bg: string; surface: string; ink: string; ink2: string; ink3: string; line: string; primary: string; secondary: string }

/** V1 Fashion/Textile is the default: maroon, gold (decoration only), cream, ink. */
export const PALETTES: Record<string, Palette> = {
  'v1-textile': { bg: '#FBF5EA', surface: '#FFFCF5', ink: '#2B1B17', ink2: '#5B4A45', ink3: '#857770', line: '#E8DCC8', primary: '#7A1F2B', secondary: '#C9973B' },
  classic: { bg: '#F7F7F5', surface: '#FFFFFF', ink: '#111827', ink2: '#4B5563', ink3: '#6B7280', line: '#E5E7EB', primary: '#111827', secondary: '#6B7280' },
  teal: { bg: '#F4F7F6', surface: '#FFFFFF', ink: '#13231F', ink2: '#3F5651', ink3: '#6B7F7A', line: '#D9E4E1', primary: '#0F766E', secondary: '#C9731A' },
  maroon: { bg: '#FBF5EA', surface: '#FFFCF5', ink: '#2B1B17', ink2: '#5B4A45', ink3: '#857770', line: '#E8DCC8', primary: '#7F1D1D', secondary: '#B45309' },
  indigo: { bg: '#F5F5FA', surface: '#FFFFFF', ink: '#1C1B33', ink2: '#4A4869', ink3: '#737190', line: '#E0E0EC', primary: '#3730A3', secondary: '#DB2777' },
  forest: { bg: '#F5F7F2', surface: '#FFFFFF', ink: '#172116', ink2: '#3F4D3D', ink3: '#6E7B6B', line: '#DCE3D6', primary: '#14532D', secondary: '#CA8A04' },
};

/** Font pairs; the font files are self-hosted (public/fonts) and exposed by app/layout.tsx as --font-* variables. */
export const FONT_PAIRS: Record<string, { heading: string; body: string }> = {
  'playfair-inter': { heading: 'var(--font-playfair)', body: 'var(--font-inter)' },
  modern: { heading: 'var(--font-inter)', body: 'var(--font-inter)' },
  serif: { heading: 'var(--font-playfair)', body: 'var(--font-playfair)' },
};

const TAMIL = ', var(--font-tamil), "Noto Sans Tamil", "Latha", "Nirmala UI", system-ui, sans-serif';

const hex = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
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
  const x = hex(a), y = hex(b);
  if (!x || !y) return 1;
  const [l1, l2] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}
const mix = (c: string, to: string, k: number) => {
  const a = hex(c)!, b = hex(to)!;
  return '#' + [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k).toString(16).padStart(2, '0')).join('');
};

/** CSS custom properties for the <html> element. Text-on-primary is chosen for 4.5:1 contrast. */
export function themeVars(t: ThemeRow | null): Record<string, string> {
  const p = PALETTES[t?.paletteId ?? ''] ?? PALETTES['v1-textile'];
  const primary = (t?.primaryColor && hex(t.primaryColor) ? t.primaryColor : p.primary).toLowerCase();
  const secondary = (t?.secondaryColor && hex(t.secondaryColor) ? t.secondaryColor : p.secondary).toLowerCase();
  const onPrimary = contrast(primary, '#ffffff') >= 4.5 ? '#ffffff' : p.ink;
  // the primary used for TEXT on the page background must pass 4.5:1; darken it until it does
  let primaryText = primary;
  for (let i = 0; i < 6 && contrast(primaryText, p.bg) < 4.5; i++) primaryText = mix(primaryText, '#000000', 0.15);
  const fonts = FONT_PAIRS[t?.fontPairId ?? ''] ?? FONT_PAIRS['playfair-inter'];
  const radius = t?.cardStyle === 'sharp' ? '2px' : t?.cardStyle === 'round' ? '20px' : '10px';
  return {
    '--sf-bg': p.bg, '--sf-surface': p.surface, '--sf-ink': p.ink, '--sf-ink-2': p.ink2, '--sf-ink-3': p.ink3, '--sf-line': p.line,
    '--sf-primary': primary, '--sf-primary-text': primaryText, '--sf-on-primary': onPrimary, '--sf-primary-soft': mix(primary, p.bg, 0.9),
    '--sf-accent': secondary, '--sf-accent-soft': mix(secondary, p.bg, 0.85),
    '--sf-font-heading': `${fonts.heading}${TAMIL}`, '--sf-font-body': `${fonts.body}${TAMIL}`,
    '--sf-radius': radius, '--sf-radius-lg': t?.cardStyle === 'sharp' ? '4px' : '18px',
  };
}
