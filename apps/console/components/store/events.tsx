'use client';

import { Card, ErrorNote, Pill, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';

const TONE: Record<string, 'ok' | 'bad' | 'warn' | 'neutral'> = { sent: 'ok', stubbed: 'neutral', skipped: 'neutral', pending: 'warn', failed: 'bad' };
const LABEL: Record<string, string> = {
  'store.created': 'Webhook: store created', 'intake.completed': 'Webhook: intake complete', 'qa.result': 'Webhook: QA result', 'store.live': 'Webhook: went live', 'renewal.due': 'Webhook: renewal due',
  'intake.chaser': 'Intake chaser to owner', 'intake.parked': 'Parked notice to owner', 'renewal.reminder': 'Renewal reminder to owner', 'store.expired': 'Expired notice to owner', 'usage.warning': 'Usage warning',
};

/** Everything this store caused to be sent: owner notices (stub transport) and n8n webhooks, with redelivery. */
export function EventsCard({ id }: { id: string }) {
  const { data, reload } = useApi<any[]>(`/stores/${id}/events`);
  const { busy, error, run } = useAction();
  if (!data) return null;
  return (
    <Card title="Notifications & webhooks" className="lg:col-span-2">
      {data.length === 0 ? <p className="text-sm text-ink-2">Nothing sent yet.</p> : (
        <ul className="divide-y divide-line">
          {data.slice(0, 20).map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{LABEL[e.event] ?? e.event}</p>
                <p className="text-xs text-ink-3">{dateTime(e.createdAt)}{e.lastError ? ` · ${e.lastError}` : ''}{e.status === 'stubbed' ? ' · stub transport' : ''}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Pill tone={TONE[e.status] ?? 'neutral'}>{e.status}</Pill>
                {e.kind === 'webhook' && e.status !== 'sent' && <button className="btn-ghost px-3" disabled={busy} onClick={() => run(async () => { await api(`/stores/${id}/events/${e.id}/redeliver`, { method: 'POST' }); reload(); })}>Resend</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={error} />
    </Card>
  );
}
