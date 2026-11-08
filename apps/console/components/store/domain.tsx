'use client';

import { useState } from 'react';
import { Card, ErrorNote, Kv, Pill, Spinner, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';
import { date, dateTime } from '@/lib/format';

const TONE: Record<string, 'ok' | 'bad' | 'warn' | 'neutral'> = { verified: 'ok', failed: 'bad', pending: 'warn', valid: 'ok', invalid: 'bad', skipped: 'neutral', unknown: 'neutral' };

export function DomainSection({ s, reload }: { s: any; reload: () => void }) {
  const d = useApi<any>(`/stores/${s.id}/domain`);
  const [domain, setDomain] = useState<string>(s.intake?.domain ?? '');
  const { busy, error, run } = useAction();
  const view = d.data && d.data.domain ? d.data : null;

  const call = (method: string, path = '', json?: unknown) => run(async () => {
    const r = await api(`/stores/${s.id}/domain${path}`, { method, json });
    d.setData(r ?? null);
    reload();
  });

  if (d.loading && !d.data) return <div className="py-10 text-center text-ink-3"><Spinner /></div>;
  return (
    <div className="space-y-4">
      <Card title="Client's domain">
        <div className="flex items-end gap-2">
          <label className="flex-1"><span className="label">Domain</span><input className="field" placeholder="shop.example.in" value={domain} onChange={(e) => setDomain(e.target.value)} /></label>
          <button className="btn-primary" disabled={busy || !domain.trim()} onClick={() => call('PUT', '', { domain })}>{view ? 'Change' : 'Save'}</button>
        </div>
        <p className="mt-2 text-xs text-ink-3">The store keeps answering on its platform address until the domain is verified.</p>
      </Card>

      {view && (
        <>
          <Card title="Send this to the client">
            <div className="rounded-xl bg-bg p-3 font-mono text-sm">
              <p>Type: {view.instructions.type}</p>
              <p className="break-all">Name: {view.instructions.name}</p>
              <p className="break-all">Value: {view.instructions.value}</p>
            </div>
            <p className="mt-2 text-sm text-ink-2">{view.instructions.note}</p>
          </Card>
          <Card title="Status" action={view.live ? <Pill tone="ok">Serving on this domain</Pill> : <Pill tone="warn">Not serving yet</Pill>}>
            <dl>
              <Kv k="DNS"><Pill tone={TONE[view.dnsStatus]}>{view.dnsStatus}</Pill></Kv>
              <Kv k="DNS answer">{view.dnsSeen.length ? view.dnsSeen.join(', ') : '—'}</Kv>
              <Kv k="Last DNS check">{dateTime(view.dnsCheckedAt)}</Kv>
              <Kv k="SSL"><Pill tone={TONE[view.sslStatus]}>{view.sslStatus}</Pill></Kv>
              {view.sslDetail && <Kv k="SSL detail">{view.sslDetail}</Kv>}
              {view.sslExpiresAt && <Kv k="Certificate expires">{date(view.sslExpiresAt)}</Kv>}
            </dl>
            <p className="mt-3 text-xs text-ink-3">Once DNS is verified the certificate is issued automatically on the first HTTPS visit (Caddy on-demand TLS), usually within a minute.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy} onClick={() => call('POST', '/check-dns')}>Check DNS</button>
              <button className="btn-secondary" disabled={busy} onClick={() => call('POST', '/check-ssl')}>Check SSL</button>
              <button className="btn-danger" disabled={busy} onClick={() => confirm('Remove this domain? The store goes back to its platform address only.') && run(async () => { await api(`/stores/${s.id}/domain`, { method: 'DELETE' }); d.setData(null); reload(); })}>Remove</button>
            </div>
          </Card>
        </>
      )}
      <ErrorNote error={error ?? d.error} />
    </div>
  );
}
