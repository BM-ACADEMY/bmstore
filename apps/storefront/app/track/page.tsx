import type { Metadata } from 'next';
import { TrackForm } from '@/components/track-form';
import { getT } from '@/lib/server/store';

export async function generateMetadata(): Promise<Metadata> { const { t } = await getT(); return { title: t('track.title') }; }

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ notFound?: string }> }) {
  const { t } = await getT();
  const sp = await searchParams;
  return (
    <div className="container-x pt-6 pb-12 max-w-lg">
      <h1 className="font-heading text-3xl">{t('track.title')}</h1>
      <div className="zari-thin w-20 mt-4 mb-6" aria-hidden />
      <TrackForm notFound={Boolean(sp.notFound)} />
    </div>
  );
}
