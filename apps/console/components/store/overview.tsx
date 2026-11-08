'use client';

import { useState } from 'react';
import { Card, ErrorNote, Kv, Meter, Pill, useAction } from '@/components/ui';
import { api } from '@/lib/api';
import { date, dateTime } from '@/lib/format';

const ACTION_LABEL: Record<string, string> = {
  'console.store_created_from_intake': 'Created from intake', 'console.intake_reapplied': 'Intake updated', 'console.policies_generated': 'Policy pages generated',
  'console.products_imported': 'Products imported', 'console.theme_applied': 'Theme applied', 'console.domain_set': 'Domain saved', 'console.domain_checked': 'DNS checked',
  'console.domain_removed': 'Domain removed', 'console.qa_run': 'QA run', 'console.impersonation_started': 'Developer opened the admin as owner', 'console.impersonation_redeemed': 'Impersonation session started',
  'console.refund_opened': 'Refund case opened', 'console.refund_approved': 'Refund approved', 'console.refund_processed': 'Refund processed', 'console.refund_failed': 'Refund failed', 'console.refund_rejected': 'Refund rejected',
};

export function Overview({ s, reload, goTo }: { s: any; reload: () => void; goTo: (t: any) => void }) {
  const { busy, error, run } = useAction();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('365');
  const act = (path: string, json: unknown = {}) => run(async () => { await api(`/stores/${s.id}/${path}`, { method: 'POST', json }); reload(); });
  const impersonate = () => run(async () => {
    const r = await api<{ url: string }>(`/stores/${s.id}/impersonate`, { method: 'POST', json: { reason } });
    window.open(r.url, '_blank', 'noopener');
    setReason('');
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Next step">
        <NextStep s={s} goTo={goTo} />
      </Card>

      <Card title="Store">
        <dl>
          <Kv k="Status">{s.status}</Kv>
          <Kv k="Owner login">{s.owner ? `${s.owner.email}${s.owner.isActive ? '' : ' (inactive)'}` : 'Not created yet (needs an email)'}</Kv>
          <Kv k="Plan">{s.tenant.plan}</Kv>
          {s.deliveryDeadline && s.status === 'BUILDING' && <Kv k="Delivery due">{date(s.deliveryDeadline)}</Kv>}
          <Kv k="Went live">{date(s.wentLiveAt)}</Kv>
          <Kv k="Expires">{s.expiresAt ? `${date(s.expiresAt)}${s.daysToExpiry !== null ? ` (${s.daysToExpiry} days)` : ''}` : '—'}</Kv>
          {s.planDay !== null && <Kv k="Plan day">{s.planDay}</Kv>}
          <Kv k="Policy pages">{s.policies.length} of 4</Kv>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn-secondary" href={s.previewUrl} target="_blank" rel="noreferrer">Open store</a>
        </div>
      </Card>

      <Card title="Usage (fair use)">
        <div className="space-y-4">
          <Meter label="Products" value={s.usage.products} max={s.usage.maxProducts} unit="" />
          <Meter label="Images" value={s.usage.mediaMb} max={s.usage.maxMediaMb} unit="MB" />
        </div>
      </Card>

      <Card title="Lifecycle">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {s.status === 'SUSPENDED' || s.status === 'PARKED'
              ? <button className="btn-secondary" disabled={busy} onClick={() => act('unsuspend')}>{s.status === 'PARKED' ? 'Unpark' : 'Unsuspend'}</button>
              : <button className="btn-danger" disabled={busy} onClick={() => confirm(`Suspend ${s.name}? The store stops answering immediately.`) && act('suspend', { reason: 'suspended from console' })}>Suspend</button>}
          </div>
          <div className="flex items-end gap-2">
            <label className="flex-1"><span className="label">Extend expiry by (days)</span><input className="field" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} /></label>
            <button className="btn-secondary" disabled={busy || !days} onClick={() => act('extend', { days: Number(days) })}>Extend</button>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex-1"><span className="label">Open the store admin as the owner</span><input className="field" placeholder="Why? (goes in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <button className="btn-secondary" disabled={busy || reason.trim().length < 5 || !s.owner} onClick={impersonate}>Impersonate</button>
          </div>
          <p className="text-xs text-ink-3">Impersonation opens a 15-minute owner session on the store's own address. Every use is audited.</p>
          <ErrorNote error={error} />
        </div>
      </Card>

      <Card title="Recent activity" className="lg:col-span-2">
        {s.audit.length === 0 ? <p className="text-sm text-ink-2">Nothing yet.</p> : (
          <ul className="divide-y divide-line">
            {s.audit.filter((a: any) => !a.action.startsWith('db.')).slice(0, 12).map((a: any, i: number) => (
              <li key={i} className="flex justify-between gap-3 py-2 text-sm"><span>{ACTION_LABEL[a.action] ?? a.action.replace(/[._]/g, ' ')}</span><span className="whitespace-nowrap text-ink-3">{dateTime(a.createdAt)}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function NextStep({ s, goTo }: { s: any; goTo: (t: any) => void }) {
  const step = (title: string, body: React.ReactNode, tab: string, cta: string) => (
    <div>
      <p className="font-medium">{title}</p>
      <div className="mt-1 text-sm text-ink-2">{body}</div>
      <button className="btn-primary mt-3" onClick={() => goTo(tab)}>{cta}</button>
    </div>
  );
  switch (s.stage) {
    case 'intake': return step('Waiting for the client', <>Missing: {s.intake?.missing?.join(', ') || '—'}. Chasers go out automatically on day 2, 4 and 7; the store parks on day 14.</>, 'intake', 'Fill in the intake');
    case 'building': return step('Build the store', 'Import the product sheet, upload photos, apply the theme, map the domain, then run QA.', 'build', 'Import and theme');
    case 'qa': return step('QA failed', <>Fix: {s.qa?.failed?.join(', ')}</>, 'qa', 'See QA results');
    case 'review': return step('Ready for go-live', 'QA passed. Check the mobile preview, then go live.', 'qa', 'Review and go live');
    case 'live': return <p className="text-sm text-ink-2">Live since {date(s.wentLiveAt)}. Renewal reminders go out on plan day 305 and 335.</p>;
    case 'expiring': return <p className="text-sm text-ink-2">Plan {s.daysToExpiry < 0 ? 'expired' : `ends in ${s.daysToExpiry} days`}. Extend the expiry once the client renews. <Pill tone="warn">Expiring</Pill></p>;
    default: return <p className="text-sm text-ink-2">The store is {s.status.toLowerCase()} and answers nobody. Unsuspend/unpark it from Lifecycle.</p>;
  }
}
