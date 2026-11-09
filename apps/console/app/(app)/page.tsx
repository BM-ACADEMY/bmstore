'use client';

import Link from 'next/link';
import { PageTitle } from '@/components/shell';
import { JobsCard } from '@/components/jobs-card';
import { Empty, ErrorNote, Spinner, StageBadge, STAGE_STYLE, useApi } from '@/components/ui';

const SEV = { high: 'border-l-bad', medium: 'border-l-warn', low: 'border-l-brand' } as const;
const STAGE_LABEL: Record<string, string> = { intake: 'Intake received', building: 'Building', qa: 'QA', review: 'Review', live: 'Live', expiring: 'Expiring', parked: 'Parked' };

export default function TodayPage() {
  const { data, error, loading } = useApi<any>('/attention');
  return (
    <>
      <PageTitle title="Needs attention" sub="Stuck intakes, deadlines, failed QA and expiring stores, most urgent first." action={<Link href="/stores/new" className="btn-primary">New store from intake</Link>} />
      <ErrorNote error={error} />
      {loading && !data ? <div className="py-16 text-center text-ink-3"><Spinner /></div> : data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {Object.entries(STAGE_LABEL).map(([id, label]) => (
              <Link key={id} href={`/stores?stage=${id}`} className="card flex flex-col gap-1 p-3 hover:border-brand/40">
                <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${STAGE_STYLE[id]}`}>{label}</span>
                <span className="text-2xl font-semibold">{data.counts[id] ?? 0}</span>
              </Link>
            ))}
          </div>
          {data.items.length === 0 ? (
            <Empty title="Nothing needs you right now">{data.total ? 'Every store is on track.' : 'Create the first store from an intake to get started.'}</Empty>
          ) : (
            <ul className="space-y-2">
              {data.items.map((i: any, n: number) => (
                <li key={`${i.store.id}-${i.kind}-${n}`}>
                  <Link href={`/stores/${i.store.id}`} className={`card flex items-start justify-between gap-3 border-l-4 p-4 hover:border-brand/40 ${SEV[i.severity as keyof typeof SEV]}`}>
                    <div className="min-w-0">
                      <p className="font-semibold">{i.title}</p>
                      <p className="mt-0.5 text-sm text-ink-2">{i.store.name}</p>
                      <p className="mt-1 text-sm text-ink-2">{i.detail}</p>
                    </div>
                    <StageBadge stage={i.store.stage} label={i.store.stageLabel} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <JobsCard />
        </>
      )}
    </>
  );
}
