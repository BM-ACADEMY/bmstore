'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart';
import { pickLang, useLayout, useStore, useT } from '@/lib/store-context';
import { headerStyleOf } from '@/lib/theme';
import { BagIcon, CloseIcon, MenuIcon, SearchIcon } from './icons';
import { LangToggle } from './lang-toggle';

interface Cat { id: string; name: string; nameTa: string | null; slug: string; parentId: string | null }

/**
 * One header, three styles from the theme (`headerStyle`): standard (brand left), centered-logo, minimal (thin,
 * monogram when there is no logo). The grocer layout adds an always-visible search field under the brand row on
 * phones, because search is how people shop a catalogue of staples.
 */
export function Header({ categories, pages }: { categories: Cat[]; pages: Array<{ slug: string; title: string }> }) {
  const { store, lang } = useStore();
  const { layout, theme } = useLayout();
  const t = useT();
  const { count, ready } = useCart();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  const style = headerStyleOf(theme);
  const top = categories.filter((c) => !c.parentId);
  const logoUrl = theme.logoUrl;
  const grocer = layout === 'v2-grocer';
  const minimal = style === 'minimal';
  const centered = style === 'centered-logo';
  const brand = (
    <Link href="/" className={`flex items-center gap-3 min-w-0 ${centered ? 'justify-self-center flex-col gap-1 py-1 text-center' : 'justify-self-center lg:justify-self-start'}`} aria-label={store.name}>
      {logoUrl ? <Image src={logoUrl} alt="" width={centered ? 48 : 40} height={centered ? 48 : 40} className={`${centered ? 'h-12 w-12' : 'h-10 w-10'} rounded-full object-cover`} priority /> : minimal ? <span className="grid h-9 w-9 place-items-center rounded-pill bg-primary text-on-primary font-heading text-lg font-semibold" aria-hidden>{store.name.trim()[0]}</span> : null}
      <span className={`font-heading font-semibold text-primary-text truncate ${centered ? 'text-lg sm:text-2xl' : minimal ? 'text-lg' : 'text-xl sm:text-2xl'}`}>{store.name}</span>
    </Link>
  );
  return (
    <header className={`sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-line ${minimal ? '' : ''}`}>
      <div className={`container-x ${centered ? 'min-h-[4.5rem] py-1' : minimal ? 'h-14' : 'h-16'} grid grid-cols-[auto_1fr_auto] items-center gap-2`}>
        <button type="button" className="tap w-12 -ml-3 inline-flex items-center justify-center rounded-card text-ink lg:hidden" aria-label={t('nav.menu')} aria-expanded={open} onClick={() => setOpen(true)}><MenuIcon className="h-6 w-6" /></button>
        {brand}
        <div className="flex items-center justify-end gap-1">
          <nav className="hidden lg:flex items-center gap-1 mr-3" aria-label={t('nav.categories')}>
            {top.slice(0, 6).map((c) => <Link key={c.id} href={`/c/${c.slug}`} className="tap inline-flex items-center px-3 rounded-card text-sm font-medium text-ink-2 hover:text-primary-text hover:bg-primary-soft">{pickLang(lang, c.name, c.nameTa)}</Link>)}
            <Link href="/c/all" className="tap inline-flex items-center px-3 rounded-card text-sm font-medium text-ink-2 hover:text-primary-text hover:bg-primary-soft">{t('category.all')}</Link>
          </nav>
          <div className="hidden lg:block mr-1"><LangToggle /></div>
          {!grocer && <Link href="/search" className="tap w-12 inline-flex items-center justify-center rounded-card text-ink hover:bg-primary-soft" aria-label={t('nav.search')}><SearchIcon className="h-6 w-6" /></Link>}
          <Link href="/cart" className="tap w-12 -mr-3 relative inline-flex items-center justify-center rounded-card text-ink hover:bg-primary-soft" aria-label={`${t('nav.cart')}${ready && count ? `, ${count}` : ''}`}>
            <BagIcon className="h-6 w-6" />
            {ready && count > 0 && <span className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-pill bg-primary text-on-primary text-[11px] font-bold grid place-items-center" aria-hidden>{count}</span>}
          </Link>
        </div>
      </div>
      {grocer && (
        <form action="/search" method="get" role="search" className="container-x pb-2.5 lg:hidden">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-3" />
            <input name="q" className="field h-11 min-h-11 pl-11 bg-surface rounded-pill text-[15px]" placeholder={t('search.placeholderGrocer')} enterKeyHint="search" aria-label={t('nav.search')} />
          </div>
        </form>
      )}
      {grocer && (
        <form action="/search" method="get" role="search" className="hidden lg:block border-t border-line/70">
          <div className="container-x py-2 flex items-center gap-3">
            <div className="relative flex-1 max-w-xl"><SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-3" /><input name="q" className="field h-11 min-h-11 pl-11 rounded-pill" placeholder={t('search.placeholderGrocer')} aria-label={t('nav.search')} /></div>
          </div>
        </form>
      )}
      {!minimal && layout === 'v1-textile' && <div className="zari-thin" aria-hidden />}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav.menu')}>
          <button type="button" className="absolute inset-0 bg-ink/50" aria-label={t('back')} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-bg shadow-card flex flex-col">
            <div className="h-16 px-4 flex items-center justify-between border-b border-line">
              <span className="font-heading text-lg font-semibold text-primary-text">{store.name}</span>
              <button type="button" className="tap w-12 inline-flex items-center justify-center" aria-label={t('back')} onClick={() => setOpen(false)}><CloseIcon className="h-6 w-6" /></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
              <div className="eyebrow mb-2">{t('nav.categories')}</div>
              <Link href="/c/all" className="tap flex items-center px-3 rounded-card font-medium hover:bg-primary-soft">{t('category.all')}</Link>
              {top.map((c) => (
                <div key={c.id}>
                  <Link href={`/c/${c.slug}`} className="tap flex items-center justify-between gap-3 px-3 rounded-card font-medium hover:bg-primary-soft"><span>{pickLang(lang, c.name, c.nameTa)}</span>{c.nameTa && lang !== 'ta' && theme.options.bilingualLabels && <span className="text-xs text-ink-3 font-normal">{c.nameTa}</span>}</Link>
                  {categories.filter((x) => x.parentId === c.id).map((s) => <Link key={s.id} href={`/c/${s.slug}`} className="tap flex items-center pl-8 pr-3 rounded-card text-ink-2 hover:bg-primary-soft">{pickLang(lang, s.name, s.nameTa)}</Link>)}
                </div>
              ))}
              <div className="eyebrow mt-6 mb-2">{t('nav.policies')}</div>
              <Link href="/track" className="tap flex items-center px-3 rounded-card text-ink-2 hover:bg-primary-soft">{t('nav.track')}</Link>
              {pages.map((p) => <Link key={p.slug} href={`/pages/${p.slug}`} className="tap flex items-center px-3 rounded-card text-ink-2 hover:bg-primary-soft">{p.title}</Link>)}
              <div className="mt-6"><LangToggle /></div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
