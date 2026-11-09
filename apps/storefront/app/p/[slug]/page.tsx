import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BuyBox, BuyProduct } from '@/components/buy-box';
import { Gallery } from '@/components/gallery';
import { cardLabels } from '@/components/labels';
import { CardProduct, ProductCard, ProductGrid } from '@/components/product-card';
import { SectionHeading } from '@/components/section';
import { StoreApiError, storeGet } from '@/lib/server/api';
import { absoluteUrl, getBootstrap, getT } from '@/lib/server/store';

type Params = { slug: string };
interface Detail { product: BuyProduct & { description: string | null; hsnCode: string | null; category: { id: string; name: string; slug: string } | null }; related: CardProduct[] }

async function load(slug: string): Promise<Detail> {
  try { return await storeGet<Detail>(`/storefront/products/${encodeURIComponent(slug)}`, { ttlMs: 20_000 }); }
  catch (e) { if (e instanceof StoreApiError && e.status === 404) notFound(); throw e; }
}
const strip = (s: string | null) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const [{ product: p }, boot] = await Promise.all([load(slug), getBootstrap()]);
  const description = strip(p.description).slice(0, 160) || `${p.name} at ${boot.store.name}`;
  return { title: p.name, description, openGraph: { type: 'website', title: `${p.name} · ${boot.store.name}`, description, images: p.images.slice(0, 1) }, twitter: { card: 'summary_large_image' } };
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [{ t }, { product: p, related }, boot, url] = await Promise.all([getT(), load(slug), getBootstrap(), absoluteUrl(`/p/${slug}`)]);
  const inStock = p.variants.length ? p.variants.some((v) => v.stock > 0) : p.stock > 0;
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: p.images, description: strip(p.description) || undefined, sku: p.sku ?? undefined, url,
    ...(p.category ? { category: p.category.name } : {}),
    brand: { '@type': 'Brand', name: boot.store.name },
    offers: p.variants.length
      ? p.variants.map((v) => ({ '@type': 'Offer', url, priceCurrency: 'INR', price: ((p.price + v.priceDelta) / 100).toFixed(2), availability: v.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition', sku: v.sku ?? undefined, name: `${v.optionName}: ${v.optionValue}`, seller: { '@type': 'Organization', name: boot.store.name } }))
      : { '@type': 'Offer', url, priceCurrency: 'INR', price: (p.price / 100).toFixed(2), availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: boot.store.name } },
  };
  return (
    <div className="container-x pt-4 pb-10">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-3 mb-3 flex gap-1.5 flex-wrap">
        <Link href="/" className="hover:text-primary-text">{t('nav.home')}</Link><span>/</span>
        {p.category && <><Link href={`/c/${p.category.slug}`} className="hover:text-primary-text">{p.category.name}</Link><span>/</span></>}
        <span className="text-ink-2 truncate max-w-[60vw]">{p.name}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-14">
        <Gallery images={p.images} name={p.name} />
        <div>
          {p.category && <div className="eyebrow mb-2">{p.category.name}</div>}
          <h1 className="font-heading text-3xl sm:text-4xl leading-tight">{p.name}</h1>
          <div className="mt-5"><BuyBox p={p} url={url} /></div>
          {p.description && (
            <section className="mt-10">
              <h2 className="font-heading text-xl mb-2">{t('product.description')}</h2>
              <div className="zari-thin w-16 mb-4" aria-hidden />
              <div className="prose-sm text-ink-2 whitespace-pre-line leading-relaxed">{strip(p.description)}</div>
            </section>
          )}
        </div>
      </div>
      {related.length > 0 && (
        <section className="mt-16">
          <SectionHeading title={t('product.related')} href={p.category ? `/c/${p.category.slug}` : '/c/all'} hrefLabel={t('home.viewAll')} />
          <ProductGrid>{related.slice(0, 4).map((r) => <ProductCard key={r.id} p={r} labels={cardLabels(t)} />)}</ProductGrid>
        </section>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
