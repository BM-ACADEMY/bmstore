import type { Metadata } from 'next';
import { CheckoutForm } from '@/components/checkout-form';
import { getT } from '@/lib/server/store';

export async function generateMetadata(): Promise<Metadata> { const { t } = await getT(); return { title: t('checkout.title'), robots: { index: false } }; }

export default async function CheckoutPage() {
  const { t } = await getT();
  return (
    <div className="container-x pt-6 pb-12">
      <h1 className="font-heading text-3xl mb-6">{t('checkout.title')}</h1>
      <CheckoutForm />
    </div>
  );
}
