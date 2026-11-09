import type { Metadata } from 'next';
import { CartView } from '@/components/cart-view';
import { getT } from '@/lib/server/store';

export async function generateMetadata(): Promise<Metadata> { const { t } = await getT(); return { title: t('cart.title'), robots: { index: false } }; }

export default async function CartPage() {
  const { t } = await getT();
  return (
    <div className="container-x pt-6 pb-10">
      <h1 className="font-heading text-3xl mb-6">{t('cart.title')}</h1>
      <CartView />
    </div>
  );
}
