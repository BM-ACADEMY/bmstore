import Image from 'next/image';
import Link from 'next/link';
import { HeroMedia } from '@/components/home/hero-media';
import { About, Contact, FeaturedTitle, HomeProps, OfferStrip, orderedSections } from '@/components/home/shared';
import { Products } from '@/components/product-grid';
import { SectionHeading } from '@/components/section';
import { pickLang } from '@/lib/i18n';

/** V1 Fashion / Textile: lookbook. Tall hero, category circles with a zari ring, generous rhythm. */
export function HomeV1(props: HomeProps) {
  const { home, boot, t, lang } = props;
  const tagline = pickLang(lang, home.hero.tagline, home.hero.taglineTa);
  const cta = pickLang(lang, home.hero.ctaLabel, home.hero.ctaLabelTa) ?? t('home.heroCta');
  const hasMedia = home.hero.bannerUrls.length > 0 || (home.hero.type === 'video' && home.hero.videoUrl);
  const blocks: Record<string, React.ReactNode> = {
    offer_strip: <OfferStrip key="offer" {...props} />,
    hero: (
      <section key="hero" className="container-x pt-5 sm:pt-8">
        <div className="relative overflow-hidden rounded-card-lg bg-primary text-on-primary min-h-[440px] sm:min-h-[520px] flex items-end">
          {hasMedia && <HeroMedia hero={home.hero} overlay={<div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" aria-hidden />} />}
          {!hasMedia && (
            <svg className="absolute inset-0 h-full w-full opacity-[0.12]" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
              <defs><pattern id="hero-weave" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M20 0l20 20-20 20L0 20z" fill="none" stroke="currentColor" strokeWidth="1" /><circle cx="20" cy="20" r="3" fill="currentColor" /></pattern></defs>
              <rect width="400" height="400" fill="url(#hero-weave)" />
            </svg>
          )}
          <div className="relative p-6 sm:p-12 max-w-xl min-w-0">
            <div className="zari-thin w-24 mb-5 !bg-[var(--sf-accent)]" aria-hidden />
            <h1 className="font-heading text-4xl sm:text-6xl leading-[1.05]">{tagline ?? boot.store.name}</h1>
            {tagline && <p className="mt-3 text-base sm:text-lg opacity-90">{boot.store.name}</p>}
            <Link href={home.hero.ctaHref ?? '/c/all'} className="btn mt-7 bg-bg text-ink hover:brightness-95 px-7">{cta}</Link>
          </div>
        </div>
      </section>
    ),
    categories: home.categories.length > 0 && (
      <section key="categories" className="container-x mt-12">
        <SectionHeading eyebrow={t('nav.shop')} title={t('home.shopByCategory')} />
        <div className="flex gap-3 overflow-x-auto py-2 px-1.5 -mx-1.5 [scrollbar-width:none]">
          {home.categories.map((c) => (
            <Link key={c.id} href={`/c/${c.slug}`} className="shrink-0 w-[108px] sm:w-[140px] text-center group">
              <div className="relative mx-auto h-[108px] w-[108px] sm:h-[140px] sm:w-[140px] rounded-full overflow-hidden ring-2 ring-accent/70 ring-offset-4 ring-offset-bg bg-primary-soft">
                {c.image ? <Image src={c.image} alt="" fill sizes="140px" className="object-cover transition group-hover:scale-105" /> : <span className="absolute inset-0 grid place-items-center font-heading text-4xl text-primary-text/60">{c.name[0]}</span>}
              </div>
              <div className="mt-3 text-sm font-medium leading-tight">{pickLang(lang, c.name, c.nameTa)}</div>
              <div className="text-xs text-ink-3">{c.productCount}</div>
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
