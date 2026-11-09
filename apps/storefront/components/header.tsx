'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart';
import { useStore, useT } from '@/lib/store-context';
import { BagIcon, CloseIcon, MenuIcon, SearchIcon } from './icons';
import { LangToggle } from './lang-toggle';

interface Cat { id: string; name: string; slug: string; parentId: string | null }

export function Header({ categories, logoUrl, pages }: { categories: Cat[]; logoUrl: string | null; pages: Array<{ slug: string; title: string }> }) {
  const { store } = useStore();
  const t = useT();
  const { count, ready } = useCart();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  const top = categories.filter((c) => !c.parentId);
  return (
    <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur border-b border-line">
      <div className="container-x h-16 grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <button type="button" className="tap w-12 -ml-3 inline-flex items-center justify-center rounded-card text-ink lg:hidden" aria-label={t('nav.menu')} aria-expanded={open} onClick={() => setOpen(true)}><MenuIcon className="h-6 w-6" /></button>
        <Link href="/" className="justify-self-center lg:justify-self-start flex items-center gap-3 min-w-0" aria-label={store.name}>
          {logoUrl ? <Image src={logoUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" priority /> : null}
          <span className="font-heading text-xl sm:text-2xl font-semibold text-primary-text truncate">{store.name}</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-6 justify-self-center absolute left-1/2 -translate-x-1/2" aria-label={t('nav.categories')}>
          {top.slice(0, 6).map((c) => <Link key={c.id} href={`/c/${c.slug}`} className={`text-sm font-medium hover:text-primary-text ${path === `/c/${c.slug}` ? 'text-primary-text' : 'text-ink-2'}`}>{c.name}</Link>)}
        </nav>
        <div className="flex items-center justify-self-end -mr-3">
          <LangToggle className="hidden sm:inline-flex mr-1" />
          <Link href="/search" className="tap w-12 inline-flex items-center justify-center rounded-card text-ink" aria-label={t('nav.search')}><SearchIcon className="h-6 w-6" /></Link>
          <Link href="/cart" className="tap w-12 inline-flex items-center justify-center rounded-card text-ink relative" aria-label={`${t('nav.cart')}${ready && count ? ` (${count})` : ''}`}>
            <BagIcon className="h-6 w-6" />
            {ready && count > 0 && <span className="absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full bg-primary text-on-primary text-[11px] font-bold grid place-items-center">{count}</span>}
          </Link>
        </div>
      </div>
      <div className="zari-thin" aria-hidden />
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
                  <Link href={`/c/${c.slug}`} className="tap flex items-center px-3 rounded-card font-medium hover:bg-primary-soft">{c.name}</Link>
                  {categories.filter((x) => x.parentId === c.id).map((s) => <Link key={s.id} href={`/c/${s.slug}`} className="tap flex items-center pl-8 pr-3 rounded-card text-ink-2 hover:bg-primary-soft">{s.name}</Link>)}
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
