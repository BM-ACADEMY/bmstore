import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OrderData, OrderView } from '@/components/order-view';
import { apiRequest, safeJson } from '@/lib/server/api';
import { getT } from '@/lib/server/store';

type Params = { orderNo: string };
type Search = { t?: string; pay?: string; phone?: string };

export async function generateMetadata(): Promise<Metadata> { const { t } = await getT(); return { title: t('order.title'), robots: { index: false, follow: false } }; }

/** Confirmation and status page. Access needs the token issued at checkout (or the phone, from /track). Never cached. */
export default async function OrderPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { orderNo } = await params;
  const sp = await searchParams;
  const { t } = await getT();
  const q = new URLSearchParams({ orderNo });
  if (sp.t) q.set('token', sp.t);
  if (sp.phone) q.set('phone', sp.phone);
  const r = await apiRequest(`/storefront/orders/lookup?${q}`);
  if (r.status === 404) notFound();
  if (r.status >= 400) throw new Error(`lookup ${r.status}`);
  const order = safeJson(r.body.toString('utf8')) as OrderData;
  return (
    <div className="container-x pt-6 pb-12">
      <h1 className="font-heading text-3xl mb-6">{sp.t && !sp.phone ? t('order.title') : t('track.title')}</h1>
      <OrderView order={order} justPlaced={Boolean(sp.t) && !sp.phone} retry={sp.pay === 'retry'} />
    </div>
  );
}
