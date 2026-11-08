'use client';

import { useState } from 'react';
import { Card, ErrorNote, OkNote, Pill, useAction, useApi } from '@/components/ui';
import { fromIntake, IntakeForm, toIntakeJson } from '@/components/intake-form';
import { api } from '@/lib/api';
import { date } from '@/lib/format';

export function IntakeSection({ s, reload }: { s: any; reload: () => void }) {
  const opts = useApi<any>('/options');
  const [v, setV] = useState(() => (s.intake ? fromIntake(s.intake) : null));
  const [saved, setSaved] = useState<any>(null);
  const { busy, error, run } = useAction();

  if (!s.intake || !v) return <Card><p className="text-sm text-ink-2">This store was not created from an intake.</p></Card>;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => { setSaved(await api(`/stores/${s.id}/intake`, { method: 'PATCH', json: toIntakeJson(v) })); reload(); });
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Card title="Intake status">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {s.intake.completedAt ? <Pill tone="ok">Complete {date(s.intake.completedAt)}</Pill> : <Pill tone="warn">Incomplete</Pill>}
          <span className="text-ink-2">Received {date(s.intake.receivedAt)} · {s.intake.chasersSent} chaser{s.intake.chasersSent === 1 ? '' : 's'} sent</span>
        </div>
        {!s.intake.completedAt && s.intake.missing.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">{s.intake.missing.map((m: string) => <li key={m} className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">{m}</li>)}</ul>
        )}
        <p className="mt-3 text-xs text-ink-3">Filling in details never overwrites the theme or settings you changed on the store. The delivery clock starts once, when the intake first becomes complete.</p>
      </Card>
      <Card><IntakeForm value={v} onChange={setV} layouts={opts.data?.layouts ?? []} lockName /></Card>
      <ErrorNote error={error} />
      {saved?.ownerLogin?.temporaryPassword && <OkNote>Owner login created: {saved.ownerLogin.email} / <span className="font-mono font-semibold">{saved.ownerLogin.temporaryPassword}</span> (shown once).</OkNote>}
      {saved && !saved.ownerLogin?.temporaryPassword && <OkNote>Saved.</OkNote>}
      <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save intake'}</button>
    </form>
  );
}
