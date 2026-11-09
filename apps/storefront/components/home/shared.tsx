import Image from 'next/image';
import Link from 'next/link';
import type { CardProduct } from '@/components/product-card';
import type { Lang } from '@/lib/i18n';
import { rupees } from '@/lib/money';
import type { BootCategory, Bootstrap, T } from '@/lib/server/store';
import { pickLang } from '@/lib/i18n';
import { whatsappLink } from '@/lib/wa';
import type { HeroData } from './hero-media';
import { PhoneIcon, PinIcon, ShieldIcon, TruckIcon, WhatsAppIcon } from '../icons';

export interface HomeData {
  sections: Array<{ type: string; enabled: boolean }>;
  offer: { text: string; textTa: string | null; href: string | null } | null;
  hero: HeroData;
  about: { title: string | null; titleTa: string | null; body: string | null; bodyTa: string | null; imageUrl: string | null } | null;
  featuredTitle: { title: string | null; titleTa: string | null } | null;
  shipping: { mode: 'FLAT' | 'FREE' | 'FREE_ABOVE'; flatRate: number; freeAbove: number | null; codEnabled: boolean } | null;
  categories: BootCategory[];
  featured: CardProduct[];
  bestsellers: CardProduct[];
  contact: { phone: string | null; whatsapp: string | null; address: string | null };
}
export interface HomeProps { home: HomeData; boot: Bootstrap; t: T; lang: Lang }

export function shippingLine(s: HomeData['shipping'], t: T): string | null {
  if (!s) return null;
  if (s.mode === 'FREE') return t('home.freeShippingAll');
  if (s.mode === 'FREE_ABOVE' && s.freeAbove !== null) return t('home.freeShipping', { amount: rupees(s.freeAbove) });
  if (s.flatRate === 0) return t('home.freeShippingAll');
  return t('home.flatShipping', { amount: rupees(s.flatRate) });
}

/** Enabled sections in the owner's order; a section with nothing to show (no categories, no sales) renders nothing. */
export function orderedSections(home: HomeData): string[] {
  return home.sections.filter((s) => s.enabled).map((s) => s.type);
}

export function OfferStrip({ home, t, lang, tone = 'primary' }: HomeProps & { tone?: 'primary' | 'accent' | 'ink' }) {
  const text = home.offer ? pickLang(lang, home.offer.text, home.offer.textTa) : shippingLine(home.shipping, t);
  if (!text) return null;
  const cls = tone === 'accent' ? 'bg-accent text-on-accent' : tone === 'ink' ? 'bg-ink text-bg' : 'bg-primary text-on-primary';
  return (
    <div className={`${cls} text-center text-sm font-medium py-2 px-4`}>
      {home.offer?.href ? <Link href={home.offer.href} className="underline underline-offset-4">{text}</Link> : text}
    </div>
  );
}

/** Owner-written About block. Only renders when the owner supplied text; never invented copy. */
export function About({ home, lang, boot }: HomeProps) {
  const a = home.about;
  if (!a) return null;
  const body = pickLang(lang, a.body, a.bodyTa);
  if (!body) return null;
  const title = pickLang(lang, a.title, a.titleTa) ?? boot.store.name;
  return (
    <section className="container-x mt-14">
      <div className={`grid gap-6 items-center ${a.imageUrl ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]' : ''}`}>
        {a.imageUrl && <div className="relative aspect-[4/3] overflow-hidden rounded-card-lg bg-primary-soft"><Image src={a.imageUrl} alt="" fill sizes="(min-width: 640px) 45vw, 100vw" className="object-cover" /></div>}
        <div>
          <h2 className="font-heading text-2xl sm:text-3xl text-ink">{title}</h2>
          <p className="mt-3 text-ink-2 leading-relaxed whitespace-pre-line">{body}</p>
        </div>
      </div>
    </section>
  );
}

export function Contact({ home, boot, t }: HomeProps) {
  const wa = whatsappLink(home.contact.whatsapp, `Hello ${boot.store.name}!`);
  const hasAny = home.contact.address || home.shipping || wa || home.contact.phone;
  if (!hasAny) return null;
  return (
    <section className="container-x mt-16">
      <div className="card p-6 sm:p-10 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="eyebrow mb-2">{t('home.contact')}</div>
          <h2 className="font-heading text-2xl sm:text-3xl">{boot.store.name}</h2>
          {home.contact.address && <p className="mt-3 text-ink-2 flex gap-2"><PinIcon className="h-5 w-5 shrink-0 text-accent" />{home.contact.address}</p>}
          {home.shipping && <p className="mt-2 text-ink-2 flex gap-2"><TruckIcon className="h-5 w-5 shrink-0 text-accent" />{shippingLine(home.shipping, t)}{home.shipping.codEnabled ? ` · ${t('home.codAvailable')}` : ''}</p>}
        </div>
        <div className="flex flex-col gap-3 sm:min-w-56">
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-wa"><WhatsAppIcon className="h-5 w-5" />{t('home.whatsapp')}</a>}
          {home.contact.phone && <a href={`tel:${home.contact.phone}`} className="btn-outline"><PhoneIcon className="h-5 w-5" />{t('home.call')} {home.contact.phone}</a>}
        </div>
      </div>
    </section>
  );
}

/** Trust strip built from facts the store has configured: online payment only when a gateway is set up, COD only when enabled, WhatsApp only with a number. */
export function TrustStrip({ boot, home, t, className = '' }: HomeProps & { className?: string }) {
  const items: Array<{ icon: React.ReactNode; text: string }> = [];
  if (boot.payments.online) items.push({ icon: <ShieldIcon className="h-5 w-5" />, text: t('trust.securePayment') });
  if (boot.settings.codEnabled) items.push({ icon: <TruckIcon className="h-5 w-5" />, text: t('trust.cod') });
  if (home.contact.whatsapp) items.push({ icon: <WhatsAppIcon className="h-5 w-5" />, text: t('trust.whatsapp') });
  const ship = shippingLine(home.shipping, t);
  if (ship && items.length < 3) items.push({ icon: <TruckIcon className="h-5 w-5" />, text: ship });
  if (!items.length) return null;
  return (
    <ul className={`grid gap-2 ${items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} ${className}`}>
      {items.slice(0, 3).map((it, i) => <li key={i} className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 text-center sm:text-left text-[12px] sm:text-sm text-ink-2 leading-tight"><span className="text-accent-text">{it.icon}</span><span>{it.text}</span></li>)}
    </ul>
  );
}

export function FeaturedTitle({ home, lang, t }: HomeProps) {
  return pickLang(lang, home.featuredTitle?.title, home.featuredTitle?.titleTa) ?? t('home.featured');
}
