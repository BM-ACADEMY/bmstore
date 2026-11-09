'use client';

import Link from 'next/link';
import { PageTitle } from '@/components/shell';
import { Empty, ErrorNote, Pill, Spinner, StageBadge, useApi } from '@/components/ui';
import { date } from '@/lib/format';

export default function RenewalsPage() {
  const { data, error, loading } = useApi<any[]>('/renewals');
  return (
    <>
      <PageTitle title="Renewals" sub="Live stores from plan day 305. Reminders go out automatically on day 305 and day 335; extend the expiry once the client pays." />
      <ErrorNote error={error} />
      {loading && !data ? <div className="py-16 text-center text-ink-3"><Spinner /></div> : !data?.length ? <Empty title="No renewals due">Stores appear here from plan day 305.</Empty> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/stores/${c.id}`} className="card block p-4 hover:border-brand/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold">{c.name}</p><p className="text-sm text-ink-2">Expires {date(c.expiresAt)}</p></div>
                  <StageBadge stage={c.stage} label={c.stageLabel} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Pill tone={c.expired ? 'bad' : c.daysToExpiry <= 30 ? 'warn' : 'neutral'}>{c.expired ? `Expired ${-c.daysToExpiry} days ago` : `${c.daysToExpiry} days left`}</Pill>
                  <Pill tone="neutral">Plan day {c.planDay}</Pill>
                  {c.milestones.map((m: any) => <Pill key={m.day} tone={m.reached ? 'brand' : 'neutral'}>Day {m.day} {m.reached ? 'reminder due/sent' : 'upcoming'}</Pill>)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
