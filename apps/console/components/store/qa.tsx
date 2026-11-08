'use client';

import { useState } from 'react';
import { Card, ErrorNote, OkNote, Pill, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';

const ICON: Record<string, { tone: 'ok' | 'bad' | 'neutral'; text: string }> = {
  pass: { tone: 'ok', text: 'Pass' }, fail: { tone: 'bad', text: 'Fail' }, skipped: { tone: 'neutral', text: 'Skipped' },
};

export function QaSection({ s, reload }: { s: any; reload: () => void }) {
  const runs = useApi<{ runs: any[] }>(`/stores/${s.id}/qa`);
  const { busy, error, run } = useAction();
  const [lived, setLived] = useState(false);
  const latest = runs.data?.runs?.[0];

  const runQa = () => run(async () => { await api(`/stores/${s.id}/qa`, { method: 'POST' }); await runs.reload(); reload(); });
  const goLive = () => confirm(`Make ${s.name} live? It will be public and indexable.`) && run(async () => { await api(`/stores/${s.id}/go-live`, { method: 'POST' }); setLived(true); reload(); });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
      <div className="space-y-4">
        <Card title="Automated QA" action={<button className="btn-primary" disabled={busy} onClick={runQa}>{busy ? 'Running…' : 'Run QA'}</button>}>
          {!latest ? <p className="text-sm text-ink-2">No QA run yet.</p> : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <Pill tone={latest.passed ? 'ok' : 'bad'}>{latest.passed ? 'Passed' : 'Failed'}</Pill>
                <span className="text-ink-2">{dateTime(latest.finishedAt ?? latest.startedAt)}</span>
              </div>
              <ul className="divide-y divide-line">
                {latest.results.map((r: any) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0"><p className="text-sm font-medium">{r.label}</p><p className="text-sm text-ink-2">{r.detail}</p></div>
                    <Pill tone={ICON[r.status].tone}>{ICON[r.status].text}</Pill>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-3">Skipped checks do not block go-live; failed checks do. Re-run after fixing.</p>
            </>
          )}
        </Card>

        <Card title="Go live">
          {s.status === 'LIVE' ? <OkNote>Live. The preview ribbon and noindex are gone.</OkNote> : (
            <>
              <p className="text-sm text-ink-2">{s.canGoLive ? 'QA passed. Check the preview, then go live.' : `Not yet: ${s.goLiveBlocker}.`}</p>
              <button className="btn-primary mt-3" disabled={!s.canGoLive || busy} onClick={goLive}>Go live</button>
            </>
          )}
          {lived && <div className="mt-3"><OkNote>{s.name} is live. The owner has been told on WhatsApp.</OkNote></div>}
        </Card>

        {runs.data && runs.data.runs.length > 1 && (
          <Card title="Earlier runs">
            <ul className="space-y-1 text-sm">{runs.data.runs.slice(1).map((r: any) => (
              <li key={r.id} className="flex justify-between"><span>{dateTime(r.startedAt)}</span><Pill tone={r.passed ? 'ok' : 'bad'}>{r.passed ? 'Passed' : `${r.results.filter((x: any) => x.status === 'fail').length} failed`}</Pill></li>
            ))}</ul>
          </Card>
        )}
        <ErrorNote error={error} />
      </div>

      <Card title="Mobile preview" className="min-w-0 lg:w-[430px]">
        <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[2rem] border-8 border-zinc-800 bg-white shadow-lg">
          <iframe title={`${s.name} on a phone`} src={s.previewUrl} className="h-[700px] w-full" sandbox="allow-scripts allow-same-origin allow-forms" />
        </div>
        <p className="mt-2 text-center text-xs text-ink-3">390 px wide. Building stores show a "Preview" ribbon and are never indexed.</p>
      </Card>
    </div>
  );
}
