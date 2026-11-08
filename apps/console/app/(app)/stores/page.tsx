'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageTitle } from '@/components/shell';
import { Empty, ErrorNote, Pill, Spinner, StageBadge, useApi } from '@/components/ui';
import { date } from '@/lib/format';

function StoreList() {
  const sp = useSearchParams();
  const router = useRouter();
  const stage = sp.get('stage') ?? '';
  const [q, setQ] = useState(sp.get('q') ?? '');
  const { data, error, loading } = useApi<any>(`/stores${stage ? `?stage=${stage}` : ''}`);
  const items = (data?.items ?? []).filter((c: any) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.subdomain.includes(q.toLowerCase()) || c.domain?.domain?.includes(q.toLowerCase()));
  const setStage = (s: string) => router.replace(s ? `/stores?stage=${s}` : '/stores');

  return (
    <>
      <PageTitle title="Stores" sub={data ? `${data.items.length} shown` : undefined} action={<Link href="/stores/new" className="btn-primary">New store</Link>} />
      <input className="field mb-3" placeholder="Search by name, address or domain" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button onClick={() => setStage('')} className={stage ? 'chip' : 'chip-on'}>All</button>
        {(data?.stages ?? []).map((s: any) => (
          <button key={s.id} onClick={() => setStage(s.id)} className={stage === s.id ? 'chip-on' : 'chip'}>{s.label}<span className="opacity-60">{s.count}</span></button>
        ))}
      </div>
      <ErrorNote error={error} />
      {loading && !data ? <div className="py-16 text-center text-ink-3"><Spinner /></div> : items.length === 0 ? <Empty title="No stores here" /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((c: any) => (
            <li key={c.id}>
              <Link href={`/stores/${c.id}`} className="card block p-4 hover:border-brand/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-sm text-ink-2">{c.domain?.domain ?? c.url.replace(/^https?:\/\//, '')}</p>
                  </div>
                  <StageBadge stage={c.stage} label={c.stageLabel} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  {c.intake && !c.intake.complete && <Pill tone="warn">Intake incomplete · day {c.intake.daysSinceReceived}</Pill>}
                  {c.status === 'BUILDING' && c.deliveryDeadline && <Pill tone={new Date(c.deliveryDeadline) < new Date() ? 'bad' : 'neutral'}>Due {date(c.deliveryDeadline)}</Pill>}
                  {c.qa && <Pill tone={c.qa.passed ? 'ok' : 'bad'}>QA {c.qa.passed ? 'passed' : 'failed'}</Pill>}
                  {c.daysToExpiry !== null && c.status === 'LIVE' && <Pill tone={c.daysToExpiry <= 30 ? 'warn' : 'neutral'}>{c.daysToExpiry < 0 ? 'Expired' : `${c.daysToExpiry} days left`}</Pill>}
                  {c.domain && <Pill tone={c.domain.dnsStatus === 'verified' ? 'ok' : 'neutral'}>Domain {c.domain.dnsStatus}</Pill>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function StoresPage() {
  return <Suspense><StoreList /></Suspense>;
}
