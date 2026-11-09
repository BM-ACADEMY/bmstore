import 'server-only';
import { cookies, headers } from 'next/headers';
import { isLang, Lang, MESSAGES, translate } from '@/lib/i18n';
import type { PublicSettings, StoreInfo } from '@/lib/store-context';
import { DEFAULT_THEME, layoutOf, LayoutId, ThemeRow } from '@/lib/theme';
import { storeGet, storeHost } from './api';
import { applyPreview } from './theme-preview';

export interface BootCategory { id: string; name: string; nameTa: string | null; slug: string; parentId: string | null; image: string | null; productCount: number }
export interface Bootstrap {
  store: StoreInfo;
  theme: ThemeRow;
  settings: PublicSettings;
  payments: { cod: boolean; online: boolean };
  categories: BootCategory[];
  pages: Array<{ slug: string; title: string; isPolicy: boolean }>;
}

/** Store bootstrap with the browser's theme preview (if any) merged in; `layout` is the resolved layout id. */
export async function getBootstrap(): Promise<Bootstrap & { layout: LayoutId; previewing: boolean }> {
  const boot = await storeGet<Bootstrap>('/storefront/bootstrap');
  const { theme, previewing } = await applyPreview(boot.theme ?? DEFAULT_THEME);
  return { ...boot, theme, previewing, layout: layoutOf(theme) };
}

export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get('bm_lang')?.value;
  return isLang(c) ? c : 'en';
}
/** Server-side translator bound to the request's language. */
export async function getT() {
  const lang = await getLang();
  return { lang, t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), messages: MESSAGES[lang] };
}
export type T = (key: string, vars?: Record<string, string | number>) => string;
export async function isPreview(): Promise<boolean> {
  return (await headers()).get('x-store-status') === 'BUILDING';
}
/** Absolute URL of a storefront path for the current store (used by metadata, JSON-LD, sitemap, WhatsApp links). */
export async function absoluteUrl(path = '/'): Promise<string> {
  const h = await headers();
  const host = await storeHost();
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}${path}`;
}
