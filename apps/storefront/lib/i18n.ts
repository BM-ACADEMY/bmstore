import en from '@/messages/en.json';
import ta from '@/messages/ta.json';

export type Lang = 'en' | 'ta';
export const LANG_COOKIE = 'bm_lang';
export const MESSAGES: Record<Lang, Record<string, string>> = { en, ta };

export function isLang(v: unknown): v is Lang { return v === 'en' || v === 'ta'; }

/** t('cart.add') with {name}-style placeholders. Falls back to English, then to the key. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Pick the Tamil variant of an owner-entered text when the page is in Tamil and one exists. */
export function pickLang(lang: Lang, en: string | null | undefined, ta: string | null | undefined): string | null {
  return (lang === 'ta' && ta) || en || ta || null;
}
