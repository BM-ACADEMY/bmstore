import Image from 'next/image';
import Link from 'next/link';
import { HeroMedia } from '@/components/home/hero-media';
import { About, Contact, FeaturedTitle, HomeProps, OfferStrip, orderedSections, shippingLine } from '@/components/home/shared';
import { TruckIcon } from '@/components/icons';
import { Products } from '@/components/product-grid';
import { SectionHeading } from '@/components/section';
import { pickLang } from '@/lib/i18n';

/**
 * V2 Food / Grocery: category-first. The hero is a short, warm strip (people come here to re-order staples, not to
 * browse a lookbook), followed by two-column category tiles with Tamil labels, then dense product grids with
 * steppers on the cards. The sticky mini-cart bar is mounted by the root layout.
 */
export function HomeV2(props: HomeProps) {
  const { home, boot, t, lang } = props;
  const tagline = pickLang(lang, home.hero.tagline, home.hero.taglineTa);
  const cta = pickLang(lang, home.hero.ctaLabel, home.hero.ctaLabelTa) ?? t('home.heroCta');
  const hasMedia = home.hero.bannerUrls.length > 0 || (home.hero.type === 'video' && home.hero.videoUrl);
  const ship = shippingLine(home.shipping, t);
  const bilingual = boot.theme.options.bilingualLabels;
  const blocks: Record<string, React.ReactNode> = {
    offer_strip: <OfferStrip key="offer" {...props} tone="accent" />,
    hero: (
      <section key="hero" className="container-x pt-4">
        <div className={`relative overflow-hidden rounded-card-lg ${hasMedia ? 'text-white min-h-[220px] sm:min-h-[320px]' : 'bg-primary text-on-primary min-h-[200px] sm:min-h-[260px]'} flex items-end`}>
          {hasMedia && <HeroMedia hero={home.hero} overlay={<div className="absolute inset-0 bg-gradient-to-r from-ink/75 via-ink/35 to-transparent" aria-hidden />} />}
          {!hasMedia && (
            <svg className="absolute inset-0 h-full w-full opacity-[0.14]" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
              <defs><pattern id="hero-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="2.2" fill="currentColor" /></pattern></defs>
              <rect width="400" height="200" fill="url(#hero-dots)" />
            </svg>
          )}
          <div className="relative p-5 sm:p-9 max-w-lg">
            <h1 className="font-heading text-[2rem] sm:text-5xl leading-[1.08] font-semibold">{tagline ?? boot.store.name}</h1>
            {ship && <p className="mt-2 text-sm sm:text-base opacity-95 inline-flex items-center gap-2"><TruckIcon className="h-5 w-5" />{ship}</p>}
            <Link href={home.hero.ctaHref ?? '/c/all'} className="btn mt-4 h-11 min-h-11 bg-bg text-ink hover:brightness-95 px-6 rounded-pill">{cta}</Link>
          </div>
        </div>
      </section>
    ),
    categories: home.categories.length > 0 && (
      <section key="categories" className="container-x mt-7">
        <SectionHeading title={t('home.shopByCategory')} href="/c/all" hrefLabel={t('home.viewAll')} />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {home.categories.map((c) => {
            const primary = pickLang(lang, c.name, c.nameTa);
            const secondary = bilingual && c.nameTa && c.nameTa !== primary ? (lang === 'ta' ? c.name : c.nameTa) : null;
            return (
              <Link key={c.id} href={`/c/${c.slug}`} className="card overflow-hidden flex items-stretch min-h-[88px] group active:scale-[0.99] transition">
                <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                  <div className="font-semibold text-[15px] leading-tight text-ink line-clamp-2">{primary}</div>
                  {secondary && <div className="mt-0.5 text-[13px] leading-tight text-ink-2 line-clamp-1" lang={lang === 'ta' ? 'en' : 'ta'}>{secondary}</div>}
                  <div className="mt-1.5 text-[11px] text-ink-3">{t('category.results', { count: c.productCount })}</div>
                </div>
                <div className="relative w-[84px] shrink-0 bg-primary-soft">
                  {c.image ? <Image src={c.image} alt="" fill sizes="96px" className="object-cover transition group-hover:scale-105" /> : <span className="absolute inset-0 grid place-items-center font-heading text-3xl text-primary-text/60">{c.name[0]}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    ),
    featured: home.featured.length > 0 && (
      <section key="featured" className="container-x mt-9">
        <SectionHeading title={FeaturedTitle(props)} href="/c/all?sort=newest" hrefLabel={t('home.viewAll')} />
        <Products items={home.featured} />
      </section>
    ),
    bestsellers: home.bestsellers.length > 0 && (
      <section key="bestsellers" className="container-x mt-9">
        <SectionHeading eyebrow={t('home.bestsellersEyebrow')} title={t('home.bestsellers')} href="/c/all" hrefLabel={t('home.viewAll')} />
        <Products items={home.bestsellers} />
      </section>
    ),
    about: <About key="about" {...props} />,
    contact: <Contact key="contact" {...props} />,
  };
  return <>{orderedSections(home).map((s) => blocks[s] || null)}</>;
}
