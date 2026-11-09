'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useStore, useT } from '@/lib/store-context';

/** Tamil / English. The choice is a host-only cookie (never Domain=...), so each store remembers it separately. */
export function LangToggle({ className = '' }: { className?: string }) {
  const { lang } = useStore();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = lang === 'ta' ? 'en' : 'ta';
  return (
    <button type="button" disabled={pending} className={`chip px-3 text-xs ${className}`} lang={next} aria-label={lang === 'ta' ? 'Switch to English' : 'தமிழுக்கு மாற்று'}
      onClick={() => { document.cookie = `bm_lang=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`; start(() => router.refresh()); }}>
      {t('lang.switch')}
    </button>
  );
}
