'use client';

import Link from 'next/link';
import { PageTitle } from '@/components/shell';
import { Empty, ErrorNote, Meter, Pill, Spinner, StageBadge, useApi } from '@/components/ui';

export default function UsagePage() {
  const { data, error, loading } = useApi<any[]>('/usage');
  return (
    <>
      <PageTitle title="Media and product usage" sub="Against the fair-use limit of each store (default 2,000 products / 10 GB images). Heaviest first." />
      <ErrorNote error={error} />
      {loading && !data ? <div className="py-16 text-center text-ink-3"><Spinner /></div> : !data?.length ? <Empty title="No stores yet" /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((u) => (
            <li key={u.id}>
              <Link href={`/stores/${u.id}`} className="card block space-y-3 p-4 hover:border-brand/40">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-semibold">{u.name}</p>
                  <div className="flex gap-1.5">{u.warning && <Pill tone="warn">Near limit</Pill>}<StageBadge stage={u.stage} label={u.stageLabel} /></div>
                </div>
                <Meter label="Products" value={u.products} max={u.maxProducts} unit="" />
                <Meter label="Images" value={u.mediaMb} max={u.maxMediaMb} unit="MB" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
