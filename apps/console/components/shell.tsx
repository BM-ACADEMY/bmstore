'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Today', icon: 'M3 12l9-8 9 8M5 10v10h14V10' },
  { href: '/stores', label: 'Stores', icon: 'M4 7h16l-1 13H5L4 7zm4 0V5a4 4 0 018 0v2' },
  { href: '/stores/new', label: 'New store', icon: 'M12 5v14M5 12h14' },
  { href: '/renewals', label: 'Renewals', icon: 'M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0012 3M19 9A7 7 0 007 6' },
  { href: '/usage', label: 'Usage', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
  { href: '/refunds', label: 'Refunds', icon: 'M3 10h18M7 15h3M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z' },
];
const MOBILE = ['/', '/stores', '/stores/new', '/renewals', '/refunds'];

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const active = (href: string) => (href === '/' ? path === '/' : href === '/stores' ? path.startsWith('/stores') && path !== '/stores/new' : path.startsWith(href));
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); };

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-line md:bg-card md:px-3 md:py-5 sticky top-0 h-dvh">
        <div className="px-3 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">BMStore</p>
          <p className="font-semibold">Developer console</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active(n.href) ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-bg'}`}>
              <Icon d={n.icon} />{n.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="btn-ghost justify-start">Sign out</button>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-card/95 px-4 py-3 backdrop-blur">
          <p className="font-semibold">Developer console</p>
          <button onClick={logout} className="text-sm font-medium text-brand">Sign out</button>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8">{children}</main>
      </div>

      <nav className="md:hidden fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        {NAV.filter((n) => MOBILE.includes(n.href)).map((n) => (
          <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active(n.href) ? 'text-brand' : 'text-ink-2'}`}>
            <Icon d={n.icon} />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
