'use client';

import Link from 'next/link';
import { PageTitle } from '@/components/shell';
import { Empty, ErrorNote, Pill, Spinner, useApi } from '@/components/ui';
import { date, rupees } from '@/lib/format';

const TONE: Record<string, 'ok' | 'bad' | 'warn' | 'neutral' | 'brand'> = { open: 'warn', processing: 'brand', refunded: 'ok', rejected: 'neutral', failed: 'bad' };

export default function RefundsPage() {
  const { data, error, loading } = useApi<any[]>('/refunds');
  return (
    <>
      <PageTitle title="Refund cases" sub="Open a case from the store's Refunds tab. The policy rule decides eligibility; a human approves." />
      <ErrorNote error={error} />
      {loading && !data ? <div className="py-16 text-center text-ink-3"><Spinner /></div> : !data?.length ? <Empty title="No refund cases" /> : (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/stores/${c.tenant.id}`} className="card flex items-start justify-between gap-3 p-4 hover:border-brand/40">
                <div className="min-w-0">
                  <p className="font-semibold">{c.tenant.name}</p>
                  <p className="text-sm text-ink-2">{rupees(c.amountPaidPaise)} · opened {date(c.createdAt)} · {c.eligible ? 'eligible' : 'not eligible'}{c.creditNoteNo ? ` · ${c.creditNoteNo}` : ''}</p>
                </div>
                <Pill tone={TONE[c.status] ?? 'neutral'}>{c.status}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
