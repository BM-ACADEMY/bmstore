import { UnavailableContent } from '@/components/unavailable';

export const metadata = { title: 'Store unavailable', robots: { index: false, follow: false } };

/** Target of the middleware rewrite for unknown hosts and SUSPENDED / PARKED stores (the root layout renders it bare). */
export default async function Unavailable({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason = 'unknown' } = await searchParams;
  const kind = reason === 'unknown' ? 'unknown' : reason === 'down' ? 'down' : 'blocked';
  return <UnavailableContent kind={kind} detail={kind === 'blocked' && reason !== 'blocked' ? decodeURIComponent(reason) : undefined} />;
}
