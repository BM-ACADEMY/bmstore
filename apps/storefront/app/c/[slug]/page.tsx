import type { Metadata } from 'next';
import Link from 'next/link';
import { Filters } from '@/components/filters';
import { Pagination } from '@/components/pagination';
import { Products } from '@/components/product-grid';
import { fetchListing, listingQuery, Search } from '@/lib/server/listing';
import { getBootstrap, getT } from '@/lib/server/store';
import { pickLang } from '@/lib/i18n';

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
  const [{ t, lang }, boot] = await Promise.all([getT(), getBootstrap()]);
  const listing = await fetchListing(sp, slug === 'all' ? {} : { category: slug });
  const title = slug === 'all' ? t('category.all') : pickLang(lang, listing.category?.name, listing.category?.nameTa) ?? t('category.all');
  const parent = listing.category?.parentId ? boot.categories.find((c) => c.id === listing.category!.parentId) : null;
  const href = (page: number) => { const p = listingQuery(sp); p.set('page', String(page)); return `/c/${slug}?${p}`; };
  const crumbs = [{ name: t('nav.home'), item: '/' }, ...(parent ? [{ name: parent.name, item: `/c/${parent.slug}` }] : []), { name: title, item: `/c/${slug}` }];
  return (
    <div className="container-x pt-6 pb-10 lg:pl-72">
      <nav aria-label="Breadcrumb" className="text-xs text-ink-3 mb-1 flex items-center gap-1.5 flex-wrap">
        {crumbs.map((c, i) => <span key={c.item} className="flex items-center gap-1.5">{i > 0 && <span>/</span>}{i < crumbs.length - 1 ? <Link href={c.item} className="inline-flex items-center justify-center min-h-11 min-w-11 px-1 -mx-1 hover:text-primary-text">{c.name}</Link> : <span className="text-ink-2">{c.name}</span>}</span>)}
      </nav>
      {boot.layout === 'v3-retail' ? (
        <div className="text-center py-2"><div className="mx-auto h-px w-10 bg-accent mb-3" aria-hidden /><h1 className="font-heading text-4xl sm:text-5xl">{title}</h1><p className="mt-1 text-sm text-ink-3">{t('category.results', { count: listing.total })}</p></div>
      ) : (
        <h1 className={`font-heading ${boot.layout === 'v2-grocer' ? 'text-[1.75rem] sm:text-4xl font-semibold' : 'text-3xl sm:text-4xl'}`}>{title}</h1>
      )}
      {listing.children.length > 0 && (
        <div className="scroll-x mt-4">{listing.children.map((c) => <Link key={c.id} href={`/c/${c.slug}`} className="chip shrink-0">{pickLang(lang, c.name, c.nameTa)}</Link>)}</div>
      )}
      <div className="mt-5 mb-6"><Filters facets={listing.facets} total={listing.total} /></div>
      {listing.items.length ? (
        <Products items={listing.items} priorityCount={2} />
      ) : (
        <div className="card p-10 text-center text-ink-2">{t('category.noResults')} <Link href={`/c/${slug}`} className="text-primary-text font-semibold underline underline-offset-4">{t('category.clear')}</Link></div>
      )}
      <Pagination page={listing.page} pageSize={listing.pageSize} total={listing.total} href={href} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })) }) }} />
    </div>
  );
}
