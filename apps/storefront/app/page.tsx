import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cardLabels } from '@/components/labels';
import { PhoneIcon, PinIcon, TruckIcon, WhatsAppIcon } from '@/components/icons';
import { CardProduct, ProductCard, ProductGrid } from '@/components/product-card';
import { SectionHeading } from '@/components/section';
import { rupees } from '@/lib/money';
import { storeGet } from '@/lib/server/api';
import { getBootstrap, getT } from '@/lib/server/store';
import { whatsappLink } from '@/lib/wa';

interface Home {
  offer: { text: string; textTa: string | null; href: string | null } | null;
  hero: { bannerUrls: string[]; tagline: string | null; taglineTa: string | null };
  shipping: { mode: 'FLAT' | 'FREE' | 'FREE_ABOVE'; flatRate: number; freeAbove: number | null; codEnabled: boolean } | null;
  categories: Array<{ id: string; name: string; slug: string; image: string | null; productCount: number }>;
  featured: CardProduct[];
  bestsellers: CardProduct[];
  contact: { phone: string | null; whatsapp: string | null; address: string | null };
}

export async function generateMetadata(): Promise<Metadata> {
  const boot = await getBootstrap();
  const desc = boot.store.address ? `${boot.store.name}, ${boot.store.address}. Shop online, pay by UPI or cash on delivery.` : `${boot.store.name}. Shop online, pay by UPI or cash on delivery.`;
  return { title: { absolute: boot.store.name }, description: desc, openGraph: { title: boot.store.name, description: desc, images: boot.theme?.bannerUrls?.[0] ? [boot.theme.bannerUrls[0]] : boot.theme?.logoUrl ? [boot.theme.logoUrl] : [] } };
}

export default async function HomePage() {
  const [{ t, lang }, home, boot] = await Promise.all([getT(), storeGet<Home>('/storefront/home'), getBootstrap()]);
  const labels = cardLabels(t);
  const offerText = home.offer ? (lang === 'ta' && home.offer.textTa ? home.offer.textTa : home.offer.text) : shippingLine(home.shipping, t);
  const tagline = lang === 'ta' && home.hero.taglineTa ? home.hero.taglineTa : home.hero.tagline;
  const banner = home.hero.bannerUrls[0];
  const wa = whatsappLink(home.contact.whatsapp, `Hello ${boot.store.name}!`);
  return (
    <>
      {offerText && (
        <div className="bg-primary text-on-primary text-center text-sm font-medium py-2 px-4">
          {home.offer?.href ? <Link href={home.offer.href} className="underline underline-offset-4">{offerText}</Link> : offerText}
        </div>
      )}

      <section className="container-x pt-5 sm:pt-8">
        <div className="relative overflow-hidden rounded-card-lg bg-primary text-on-primary min-h-[440px] sm:min-h-[520px] flex items-end">
          {banner && <Image src={banner} alt="" fill priority sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover" />}
          <div className={`absolute inset-0 ${banner ? 'bg-gradient-to-t from-ink/80 via-ink/20 to-transparent' : ''}`} aria-hidden />
          {!banner && (
            <svg className="absolute inset-0 h-full w-full opacity-[0.12]" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
              <defs><pattern id="hero-weave" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M20 0l20 20-20 20L0 20z" fill="none" stroke="currentColor" strokeWidth="1" /><circle cx="20" cy="20" r="3" fill="currentColor" /></pattern></defs>
              <rect width="400" height="400" fill="url(#hero-weave)" />
            </svg>
          )}
          <div className="relative p-6 sm:p-12 max-w-xl">
            <div className="zari-thin w-24 mb-5 !bg-[var(--sf-accent)]" aria-hidden />
            <h1 className="font-heading text-4xl sm:text-6xl leading-[1.05]">{tagline ?? boot.store.name}</h1>
            {tagline && <p className="mt-3 text-base sm:text-lg opacity-90">{boot.store.name}</p>}
            <Link href="/c/all" className="btn mt-7 bg-bg text-ink hover:brightness-95 px-7">{t('home.heroCta')}</Link>
          </div>
        </div>
      </section>

      {home.categories.length > 0 && (
        <section className="container-x mt-12">
          <SectionHeading eyebrow={t('nav.shop')} title={t('home.shopByCategory')} />
          <div className="scroll-x snap-x">
            {home.categories.map((c) => (
              <Link key={c.id} href={`/c/${c.slug}`} className="snap-start shrink-0 w-[108px] sm:w-[140px] text-center group">
                <div className="relative mx-auto h-[108px] w-[108px] sm:h-[140px] sm:w-[140px] rounded-full overflow-hidden ring-2 ring-accent/70 ring-offset-4 ring-offset-bg bg-primary-soft">
                  {c.image ? <Image src={c.image} alt="" fill sizes="140px" className="object-cover transition group-hover:scale-105" /> : <span className="absolute inset-0 grid place-items-center font-heading text-4xl text-primary-text/60">{c.name[0]}</span>}
                </div>
                <div className="mt-3 text-sm font-medium leading-tight">{c.name}</div>
                <div className="text-xs text-ink-3">{c.productCount}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {home.featured.length > 0 && (
        <section className="container-x mt-14">
          <SectionHeading eyebrow={t('home.featured')} title={t('home.featured')} href="/c/all?sort=newest" hrefLabel={t('home.viewAll')} />
          <ProductGrid>{home.featured.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} labels={labels} />)}</ProductGrid>
        </section>
      )}

      {home.bestsellers.length > 0 && (
        <section className="container-x mt-14">
          <SectionHeading eyebrow={t('home.bestsellers')} title={t('home.bestsellers')} />
          <ProductGrid>{home.bestsellers.map((p) => <ProductCard key={p.id} p={p} labels={labels} />)}</ProductGrid>
        </section>
      )}

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
    </>
  );
}

function shippingLine(s: Home['shipping'], t: (k: string, v?: Record<string, string | number>) => string): string | null {
  if (!s) return null;
  if (s.mode === 'FREE') return t('home.freeShippingAll');
  if (s.mode === 'FREE_ABOVE' && s.freeAbove !== null) return t('home.freeShipping', { amount: rupees(s.freeAbove) });
  if (s.flatRate === 0) return t('home.freeShippingAll');
  return t('home.flatShipping', { amount: rupees(s.flatRate) });
}
