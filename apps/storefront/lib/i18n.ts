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
