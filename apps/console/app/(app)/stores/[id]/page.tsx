'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { ErrorNote, Spinner, StageBadge, useApi } from '@/components/ui';
import { Overview } from '@/components/store/overview';
import { IntakeSection } from '@/components/store/intake';
import { BuildSection } from '@/components/store/build';
import { DomainSection } from '@/components/store/domain';
import { QaSection } from '@/components/store/qa';
import { RefundSection } from '@/components/store/refunds';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'intake', label: 'Intake' },
  { id: 'build', label: 'Build' },
  { id: 'domain', label: 'Domain' },
  { id: 'qa', label: 'QA & go-live' },
  { id: 'refunds', label: 'Refunds' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: s, error, loading, reload } = useApi<any>(`/stores/${id}`);
  const [tab, setTab] = useState<Tab>('overview');

  if (loading && !s) return <div className="py-16 text-center text-ink-3"><Spinner /></div>;
  if (!s) return <ErrorNote error={error ?? 'Store not found'} />;

  return (
    <>
      <Link href="/stores" className="text-sm font-medium text-brand">← Stores</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold md:text-2xl">{s.name}</h1>
          <a href={s.url} target="_blank" rel="noreferrer" className="text-sm text-brand break-all">{s.url.replace(/^https?:\/\//, '')}</a>
        </div>
        <StageBadge stage={s.stage} label={s.stageLabel} />
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'chip-on' : 'chip'}>{t.label}</button>)}
      </div>
      <ErrorNote error={error} />
      {tab === 'overview' && <Overview s={s} reload={reload} goTo={setTab} />}
      {tab === 'intake' && <IntakeSection s={s} reload={reload} />}
      {tab === 'build' && <BuildSection s={s} reload={reload} />}
      {tab === 'domain' && <DomainSection s={s} reload={reload} />}
      {tab === 'qa' && <QaSection s={s} reload={reload} />}
      {tab === 'refunds' && <RefundSection s={s} />}
    </>
  );
}
