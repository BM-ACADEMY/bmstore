import Image from 'next/image';
import Link from 'next/link';
import { HeroMedia } from '@/components/home/hero-media';
import { About, Contact, FeaturedTitle, HomeProps, OfferStrip, orderedSections, TrustStrip } from '@/components/home/shared';
import { Products } from '@/components/product-grid';
import { SectionHeading } from '@/components/section';
import { pickLang } from '@/lib/i18n';

/**
 * V3 General retail / Jewellery: feature blocks. Full-bleed banner with a thin rule and serif display type, a trust
 * strip built from configured facts, "shop by style" tiles (the categories, large), then framed product cards.
 */
export function HomeV3(props: HomeProps) {
  const { home, boot, t, lang } = props;
  const tagline = pickLang(lang, home.hero.tagline, home.hero.taglineTa);
  const cta = pickLang(lang, home.hero.ctaLabel, home.hero.ctaLabelTa) ?? t('home.heroCta');
  const hasMedia = home.hero.bannerUrls.length > 0 || (home.hero.type === 'video' && home.hero.videoUrl);
  const blocks: Record<string, React.ReactNode> = {
    offer_strip: <OfferStrip key="offer" {...props} tone="ink" />,
    hero: (
      <section key="hero">
        <div className={`relative overflow-hidden ${hasMedia ? 'text-white' : 'bg-primary text-on-primary'} min-h-[480px] sm:min-h-[560px] flex items-end`}>
          {hasMedia && <HeroMedia hero={home.hero} sizes="100vw" overlay={<div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/30 to-ink/10" aria-hidden />} />}
          {!hasMedia && (
            <svg className="absolute inset-0 h-full w-full opacity-[0.1]" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
              <defs><pattern id="hero-lines" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 12h24" stroke="currentColor" strokeWidth="1" /></pattern></defs>
              <rect width="400" height="400" fill="url(#hero-lines)" />
            </svg>
          )}
          <div className="relative container-x pb-9 sm:pb-14 pt-24 min-w-0">
            <div className="h-px w-14 bg-accent mb-5" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-90">{boot.store.name}</p>
            <h1 className="font-heading mt-2 text-[2.6rem] sm:text-6xl leading-[1.02] max-w-2xl">{tagline ?? boot.store.name}</h1>
            <Link href={home.hero.ctaHref ?? '/c/all'} className="btn mt-7 bg-bg text-ink hover:brightness-95 px-7 rounded-card">{cta}</Link>
          </div>
        </div>
        <div className="border-b border-line bg-surface"><div className="container-x py-3.5"><TrustStrip {...props} /></div></div>
      </section>
    ),
    categories: home.categories.length > 0 && (
      <section key="categories" className="container-x mt-12">
        <SectionHeading eyebrow={t('nav.shop')} title={t('home.shopByStyle')} center />
        <div className={`grid gap-3 ${home.categories.length === 1 ? 'grid-cols-1' : home.categories.length === 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
          {home.categories.slice(0, 8).map((c, i) => (
            <Link key={c.id} href={`/c/${c.slug}`} className={`group relative overflow-hidden rounded-card bg-primary text-bg ${i === 0 && home.categories.length >= 3 ? 'col-span-2 aspect-[2/1] lg:col-span-2' : 'aspect-[4/5] lg:aspect-square'}`}>
              {c.image ? <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover transition duration-700 group-hover:scale-105" /> : <span className="absolute inset-0 grid place-items-center font-heading text-6xl text-bg/30">{c.name[0]}</span>}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <div className="font-heading text-xl sm:text-2xl leading-tight">{pickLang(lang, c.name, c.nameTa)}</div>
                <div className="mt-1 text-xs opacity-80 tracking-wide">{t('category.results', { count: c.productCount })}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    ),
    featured: home.featured.length > 0 && (
      <section key="featured" className="container-x mt-14">
        <SectionHeading eyebrow={t('home.featuredEyebrow')} title={FeaturedTitle(props)} href="/c/all?sort=newest" hrefLabel={t('home.viewAll')} />
        <Products items={home.featured} />
      </section>
    ),
    bestsellers: home.bestsellers.length > 0 && (
      <section key="bestsellers" className="container-x mt-14">
        <SectionHeading eyebrow={t('home.bestsellersEyebrow')} title={t('home.bestsellers')} href="/c/all" hrefLabel={t('home.viewAll')} />
        <Products items={home.bestsellers} />
      </section>
    ),
    about: <About key="about" {...props} />,
    contact: <Contact key="contact" {...props} />,
  };
  return <>{orderedSections(home).map((s) => blocks[s] || null)}</>;
}
