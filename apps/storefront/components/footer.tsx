import Link from 'next/link';
import type { Bootstrap } from '@/lib/server/store';
import { layoutOf } from '@/lib/theme';
import { whatsappLink } from '@/lib/wa';
import { PhoneIcon, PinIcon, ShieldIcon, WhatsAppIcon } from './icons';

export function Footer({ boot, t }: { boot: Bootstrap; t: (k: string, v?: Record<string, string | number>) => string }) {
  const wa = whatsappLink(boot.store.whatsappNumber, `Hello ${boot.store.name}!`);
  const policies = boot.pages.filter((p) => p.isPolicy);
  const other = boot.pages.filter((p) => !p.isPolicy);
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      {layoutOf(boot.theme) === 'v1-textile' ? <div className="zari" aria-hidden /> : <div className="h-1 bg-primary" aria-hidden />}
      <div className="container-x py-10 grid gap-8 sm:grid-cols-3">
        <div>
          <div className="font-heading text-xl font-semibold text-primary-text">{boot.store.name}</div>
          {boot.store.address && <p className="mt-3 text-sm text-ink-2 flex gap-2"><PinIcon className="h-5 w-5 shrink-0 text-accent" />{boot.store.address}</p>}
          {boot.store.gstNumber && <p className="mt-2 text-xs text-ink-3">GSTIN {boot.store.gstNumber}</p>}
        </div>
        <div>
          <div className="eyebrow mb-3">{t('footer.contact')}</div>
          <div className="flex flex-col gap-2 text-sm">
            {boot.store.supportPhone && <a href={`tel:${boot.store.supportPhone}`} className="inline-flex items-center gap-2 tap text-ink-2 hover:text-primary-text"><PhoneIcon className="h-5 w-5 text-accent" />{boot.store.supportPhone}</a>}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 tap text-ink-2 hover:text-primary-text"><WhatsAppIcon className="h-5 w-5 text-[#1b7a4e]" />{t('home.whatsapp')}</a>}
            <Link href="/track" className="inline-flex items-center gap-2 tap text-ink-2 hover:text-primary-text">{t('nav.track')}</Link>
          </div>
        </div>
        <div>
          <div className="eyebrow mb-3">{t('nav.policies')}</div>
          <div className="flex flex-col gap-1 text-sm">
            {[...policies, ...other].map((p) => <Link key={p.slug} href={`/pages/${p.slug}`} className="py-2 text-ink-2 hover:text-primary-text">{p.title}</Link>)}
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-x py-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-ink-3">
          <span className="inline-flex items-center gap-2"><ShieldIcon className="h-4 w-4" />{t('footer.secure')}</span>
          <span>© {new Date().getFullYear()} {boot.store.name}. {t('footer.rights')}</span>
        </div>
      </div>
    </footer>
  );
}
