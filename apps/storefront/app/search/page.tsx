import type { Metadata } from 'next';
import { Filters } from '@/components/filters';
import { SearchIcon } from '@/components/icons';
import { cardLabels } from '@/components/labels';
import { Pagination } from '@/components/pagination';
import { ProductCard, ProductGrid } from '@/components/product-card';
import { getT } from '@/lib/server/store';
import { fetchListing, listingQuery, Search } from '@/lib/server/listing';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('search.title'), robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const { t } = await getT();
  const listing = q ? await fetchListing(sp) : null;
  const labels = cardLabels(t);
  const href = (page: number) => { const p = listingQuery(sp); p.set('page', String(page)); return `/search?${p}`; };
  return (
    <div className="container-x pt-6 pb-10">
      <h1 className="font-heading text-3xl">{t('search.title')}</h1>
      <form action="/search" method="get" role="search" className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-3" />
          <input name="q" defaultValue={q} className="field pl-12" placeholder={t('search.placeholder')} autoFocus={!q} enterKeyHint="search" aria-label={t('search.title')} />
        </div>
        <button type="submit" className="btn-primary">{t('nav.search')}</button>
      </form>
      {!listing && <p className="mt-10 text-center text-ink-3">{t('search.empty')}</p>}
      {listing && (
        <div className="mt-8">
          <h2 className="font-heading text-xl mb-4">{t('search.for', { q })}</h2>
          <div className="mb-6"><Filters facets={listing.facets} total={listing.total} /></div>
          {listing.items.length ? <ProductGrid>{listing.items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} labels={labels} />)}</ProductGrid> : <div className="card p-10 text-center text-ink-2">{t('category.noResults')}</div>}
          <Pagination page={listing.page} pageSize={listing.pageSize} total={listing.total} href={href} />
        </div>
      )}
    </div>
  );
}
