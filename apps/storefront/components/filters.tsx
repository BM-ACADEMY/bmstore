'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/store-context';
import { CloseIcon } from './icons';

export interface Facets { minPrice: number; maxPrice: number; options: Record<string, string[]> }
const SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'name'] as const;

/** Sort select + a bottom-sheet filter panel on phones (inline on desktop). State lives in the URL so pages are shareable and server-rendered. */
export function Filters({ facets, total }: { facets: Facets; total: number }) {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(sp.get('minPrice') ? String(Number(sp.get('minPrice')) / 100) : '');
  const [max, setMax] = useState(sp.get('maxPrice') ? String(Number(sp.get('maxPrice')) / 100) : '');
  const [stock, setStock] = useState(sp.get('inStock') === '1');
  const [opts, setOpts] = useState<string[]>(sp.get('option')?.split(',').filter(Boolean) ?? []);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);

  const push = (next: URLSearchParams) => { next.delete('page'); router.push(`${path}${next.toString() ? `?${next}` : ''}`); setOpen(false); };
  const apply = () => {
    const next = new URLSearchParams(sp.toString());
    const set = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
    set('minPrice', min ? String(Math.round(Number(min) * 100)) : '');
    set('maxPrice', max ? String(Math.round(Number(max) * 100)) : '');
    set('inStock', stock ? '1' : '');
    set('option', opts.join(','));
    push(next);
  };
  const clear = () => { setMin(''); setMax(''); setStock(false); setOpts([]); const next = new URLSearchParams(sp.toString()); for (const k of ['minPrice', 'maxPrice', 'inStock', 'option']) next.delete(k); push(next); };
  const active = ['minPrice', 'maxPrice', 'inStock', 'option'].filter((k) => sp.get(k)).length;
  const toggleOpt = (v: string) => setOpts((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const panel = (
    <div className="flex flex-col gap-6">
      <div>
        <div className="label">{t('category.price')} (₹)</div>
        <div className="grid grid-cols-2 gap-2">
          <input inputMode="numeric" className="field" placeholder={`${t('category.min')} ${Math.floor(facets.minPrice / 100)}`} value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ''))} aria-label={t('category.min')} />
          <input inputMode="numeric" className="field" placeholder={`${t('category.max')} ${Math.ceil(facets.maxPrice / 100)}`} value={max} onChange={(e) => setMax(e.target.value.replace(/[^\d]/g, ''))} aria-label={t('category.max')} />
        </div>
      </div>
      <label className="flex items-center gap-3 tap cursor-pointer">
        <input type="checkbox" className="h-5 w-5 accent-[var(--sf-primary)]" checked={stock} onChange={(e) => setStock(e.target.checked)} />
        <span className="font-medium">{t('category.inStock')}</span>
      </label>
      {Object.entries(facets.options).map(([name, values]) => (
        <div key={name}>
          <div className="label">{name}</div>
          <div className="flex flex-wrap gap-2">
            {values.map((v) => { const key = `${name}:${v}`; const on = opts.includes(key); return <button key={v} type="button" onClick={() => toggleOpt(key)} className={on ? 'chip-on' : 'chip'} aria-pressed={on}>{v}</button>; })}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-primary flex-1" onClick={apply}>{t('category.apply')}</button>
        <button type="button" className="btn-ghost" onClick={clear}>{t('category.clear')}</button>
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm text-ink-2">{t('category.results', { count: total })}</div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="sort">{t('category.sort')}</label>
        <select id="sort" className="field !w-auto h-11 min-h-11 py-0 pr-8 text-sm" value={sp.get('sort') ?? 'featured'} onChange={(e) => { const next = new URLSearchParams(sp.toString()); next.set('sort', e.target.value); push(next); }}>
          {SORTS.map((s) => <option key={s} value={s}>{t(`category.sort.${s}`)}</option>)}
        </select>
        <button type="button" className="chip lg:hidden" onClick={() => setOpen(true)} aria-expanded={open}>{t('category.filters')}{active ? ` · ${active}` : ''}</button>
      </div>
      <aside className="hidden lg:block fixed left-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] top-28 w-60" aria-label={t('category.filters')}>{panel}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('category.filters')}>
          <button type="button" className="absolute inset-0 bg-ink/50" aria-label={t('back')} onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-card-lg bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between mb-4"><h2 className="font-heading text-xl">{t('category.filters')}</h2><button type="button" className="tap w-12 inline-flex items-center justify-center" aria-label={t('back')} onClick={() => setOpen(false)}><CloseIcon className="h-6 w-6" /></button></div>
            {panel}
          </div>
        </div>
      )}
    </div>
  );
}
