import type { Metadata } from 'next';
import Link from 'next/link';
import { Filters } from '@/components/filters';
import { cardLabels } from '@/components/labels';
import { Pagination } from '@/components/pagination';
import { ProductCard, ProductGrid } from '@/components/product-card';
import { fetchListing, listingQuery, Search } from '@/lib/server/listing';
import { getBootstrap, getT } from '@/lib/server/store';

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const boot = await getBootstrap();
  const cat = boot.categories.find((c) => c.slug === slug);
  const { t } = await getT();
  const title = slug === 'all' ? t('category.all') : cat?.name ?? t('category.all');
  return { title, description: `${title} at ${boot.store.name}. ${cat ? `${cat.productCount} products.` : ''} Pay by UPI or cash on delivery.`, openGraph: { title: `${title} · ${boot.store.name}`, images: cat?.image ? [cat.image] : [] } };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [{ t }, boot] = await Promise.all([getT(), getBootstrap()]);
  const listing = await fetchListing(sp, slug === 'all' ? {} : { category: slug });
  const labels = cardLabels(t);
  const title = slug === 'all' ? t('category.all') : listing.category?.name ?? t('category.all');
  const parent = listing.category?.parentId ? boot.categories.find((c) => c.id === listing.category!.parentId) : null;
  const href = (page: number) => { const p = listingQuery(sp); p.set('page', String(page)); return `/c/${slug}?${p}`; };
  const crumbs = [{ name: t('nav.home'), item: '/' }, ...(parent ? [{ name: parent.name, item: `/c/${parent.slug}` }] : []), { name: title, item: `/c/${slug}` }];
  return (
    <div className="container-x pt-6 pb-10 lg:pl-72">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-3 mb-3 flex gap-1.5 flex-wrap">
        {crumbs.map((c, i) => <span key={c.item} className="flex gap-1.5">{i > 0 && <span>/</span>}{i < crumbs.length - 1 ? <Link href={c.item} className="hover:text-primary-text">{c.name}</Link> : <span className="text-ink-2">{c.name}</span>}</span>)}
      </nav>
      <h1 className="font-heading text-3xl sm:text-4xl">{title}</h1>
      {listing.children.length > 0 && (
        <div className="scroll-x mt-4">{listing.children.map((c) => <Link key={c.id} href={`/c/${c.slug}`} className="chip shrink-0">{c.name}</Link>)}</div>
      )}
      <div className="mt-5 mb-6"><Filters facets={listing.facets} total={listing.total} /></div>
      {listing.items.length ? (
        <ProductGrid>{listing.items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} labels={labels} />)}</ProductGrid>
      ) : (
        <div className="card p-10 text-center text-ink-2">{t('category.noResults')} <Link href={`/c/${slug}`} className="text-primary-text font-semibold underline underline-offset-4">{t('category.clear')}</Link></div>
      )}
      <Pagination page={listing.page} pageSize={listing.pageSize} total={listing.total} href={href} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })) }) }} />
    </div>
  );
}
