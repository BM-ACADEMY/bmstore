import 'server-only';
import { cookies, headers } from 'next/headers';
import { isLang, Lang, MESSAGES, translate } from '@/lib/i18n';
import type { PublicSettings, StoreInfo } from '@/lib/store-context';
import type { ThemeRow } from '@/lib/theme';
import { storeGet, storeHost } from './api';

export interface Bootstrap {
  store: StoreInfo;
  theme: ThemeRow | null;
  settings: PublicSettings;
  payments: { cod: boolean; online: boolean };
  categories: Array<{ id: string; name: string; slug: string; parentId: string | null; image: string | null; productCount: number }>;
  pages: Array<{ slug: string; title: string; isPolicy: boolean }>;
}

export const getBootstrap = () => storeGet<Bootstrap>('/storefront/bootstrap');

export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get('bm_lang')?.value;
  return isLang(c) ? c : 'en';
}
/** Server-side translator bound to the request's language. */
export async function getT() {
  const lang = await getLang();
  return { lang, t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars), messages: MESSAGES[lang] };
}
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
