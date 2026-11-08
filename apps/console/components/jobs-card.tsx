'use client';

import { Card, ErrorNote, Pill, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';

const LABEL: Record<string, string> = {
  'intake-chasers': 'Intake chasers (day 2, 4, 7; park at 14)', 'renewal-reminders': 'Renewal reminders (day 305, 335)', 'expiry-suspend': 'Expiry → suspend',
  'backup-check': 'Nightly backup check', 'usage-warnings': 'Usage warnings', 'weekly-summary': 'Weekly summary',
};

/** Scheduled jobs: last run, result, run now. The backup line turns red when the nightly backup is missing or old. */
export function JobsCard() {
  const { data, reload } = useApi<any[]>('/jobs');
  const { busy, error, run } = useAction();
  if (!data) return null;
  return (
    <Card title="Scheduled jobs" className="mt-6">
      <ul className="divide-y divide-line">
        {data.map((j) => {
          const bad = j.job === 'backup-check' && j.details && j.details.status !== 'ok';
          return (
            <li key={j.job} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{LABEL[j.job] ?? j.job}</p>
                <p className={`text-sm ${bad ? 'text-bad' : 'text-ink-2'}`}>{j.at ? `${j.summary} · ${ago(j.at)}` : 'Not run yet'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {bad && <Pill tone="bad">Check</Pill>}
                <button className="btn-ghost px-3" disabled={busy} onClick={() => run(async () => { await api(`/jobs/${j.job}/run`, { method: 'POST' }); reload(); })}>Run</button>
              </div>
            </li>
          );
        })}
      </ul>
      <ErrorNote error={error} />
    </Card>
  );
}
