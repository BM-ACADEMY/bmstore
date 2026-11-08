import Link from 'next/link';
import { getT } from '@/lib/server/store';

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="container-x py-24 text-center">
      <h1 className="font-heading text-3xl text-primary-text">{t('error.notFound')}</h1>
      <Link href="/" className="btn-outline mt-8">{t('nav.home')}</Link>
    </div>
  );
}
