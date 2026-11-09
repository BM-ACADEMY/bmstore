'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useStore, useT } from '@/lib/store-context';
import { FONT_PAIRS, LAYOUTS, LayoutId, PALETTES, themeVars, type ThemeRow } from '@/lib/theme';
import { CloseIcon } from './icons';

const COOKIE = 'bm_theme_preview';
const LAYOUT_NAMES: Record<LayoutId, string> = { 'v1-textile': 'Fashion / Textile', 'v2-grocer': 'Food / Grocery', 'v3-retail': 'Retail / Jewellery' };

function readCookie(): Record<string, unknown> {
  const m = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`));
  if (!m) return {};
  try { return JSON.parse(decodeURIComponent(m.slice(COOKIE.length + 1))); } catch { return {}; }
}
function writeCookie(draft: Record<string, unknown> | null) {
  // host-only (no Domain attribute): the choice never leaks to sibling stores on the platform domain
  document.cookie = draft ? `${COOKIE}=${encodeURIComponent(JSON.stringify(draft))}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax` : `${COOKIE}=; path=/; max-age=0`;
}

/**
 * Visitor-facing theme / colour switcher, enabled per tenant (theme option `switcherEnabled`, meant for the demo
 * stores). Palette and font changes apply instantly as CSS variables; layout changes re-render on the server.
 * The choice lives in the preview cookie for this host only and "Reset" returns to the store's saved theme.
 */
export function ThemeSwitcher() {
  const { theme, previewing } = useStore();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  useEffect(() => { setDraft(readCookie()); }, []);
  const apply = (patch: Record<string, unknown>, reload: boolean) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    writeCookie(next);
    const merged: ThemeRow = { ...theme, ...(next as Partial<ThemeRow>) };
    for (const [k, v] of Object.entries(themeVars(merged))) document.documentElement.style.setProperty(k, v);
    if (reload) start(() => router.refresh());
  };
  const reset = () => { setDraft({}); writeCookie(null); start(() => router.refresh()); };
  const current = { ...theme, ...(draft as Partial<ThemeRow>) };
  return (
    <div className="fixed right-3 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] lg:bottom-5 z-[55]">
      {open ? (
        <div className="w-[min(92vw,340px)] rounded-card-lg bg-surface text-ink border border-line shadow-[0_20px_50px_-20px_rgb(0_0_0/0.45)] p-4" role="dialog" aria-label={t('switcher.title')}>
          <div className="flex items-center justify-between mb-3">
            <div><div className="font-semibold">{t('switcher.title')}</div><div className="text-xs text-ink-3">{t('switcher.hint')}</div></div>
            <button type="button" className="tap w-11 inline-flex items-center justify-center rounded-card" aria-label={t('back')} onClick={() => setOpen(false)}><CloseIcon className="h-5 w-5" /></button>
          </div>
          <div className="label">{t('switcher.layout')}</div>
          <div className="grid grid-cols-3 gap-1.5 mb-3" role="radiogroup" aria-label={t('switcher.layout')}>
            {LAYOUTS.map((l) => <button key={l} type="button" role="radio" aria-checked={current.layoutVariant === l} disabled={pending} onClick={() => apply({ layoutVariant: l }, true)} className={`h-11 rounded-card border text-[11px] font-semibold leading-tight px-1 ${current.layoutVariant === l ? 'bg-ink text-bg border-ink' : 'border-line'}`}>{LAYOUT_NAMES[l]}</button>)}
          </div>
          <div className="label">{t('switcher.palette')}</div>
          <div className="grid grid-cols-5 gap-1.5 mb-3" role="radiogroup" aria-label={t('switcher.palette')}>
            {Object.values(PALETTES).map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={current.paletteId === p.id} aria-label={p.name} title={p.name} onClick={() => apply({ paletteId: p.id, primaryColor: p.primary, secondaryColor: p.secondary }, false)}
                className={`h-11 rounded-card border-2 p-1 ${current.paletteId === p.id ? 'border-ink' : 'border-line'}`} style={{ background: p.bg }}>
                <span className="flex h-full overflow-hidden rounded-[4px]"><span className="flex-1" style={{ background: p.primary }} /><span className="w-2.5" style={{ background: p.secondary }} /><span className="w-1.5" style={{ background: p.tertiary }} /></span>
              </button>
            ))}
          </div>
          <div className="label">{t('switcher.fonts')}</div>
          <select className="field h-11 min-h-11 mb-3" value={current.fontPairId} aria-label={t('switcher.fonts')} onChange={(e) => apply({ fontPairId: e.target.value }, false)}>
            {Object.values(FONT_PAIRS).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button type="button" className="btn-outline w-full h-11 min-h-11" disabled={pending || (!previewing && !Object.keys(draft).length)} onClick={reset}>{t('switcher.reset')}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="h-12 pl-3 pr-4 rounded-pill bg-ink text-bg shadow-[0_12px_30px_-12px_rgb(0_0_0/0.5)] inline-flex items-center gap-2 text-sm font-semibold" aria-label={t('switcher.title')}>
          <span className="flex -space-x-1" aria-hidden><span className="h-4 w-4 rounded-full border border-bg" style={{ background: 'var(--sf-primary)' }} /><span className="h-4 w-4 rounded-full border border-bg" style={{ background: 'var(--sf-accent)' }} /><span className="h-4 w-4 rounded-full border border-bg" style={{ background: 'var(--sf-tertiary)' }} /></span>
          {t('switcher.button')}
        </button>
      )}
    </div>
  );
}
