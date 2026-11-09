'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageTitle } from '@/components/shell';
import { Card, ErrorNote, OkNote, useAction, useApi } from '@/components/ui';
import { emptyIntake, IntakeForm, IntakeValues, toIntakeJson } from '@/components/intake-form';
import { api } from '@/lib/api';

/** Create store from intake: fill the form, or paste the intake JSON (Google Form export / n8n). Safe to submit twice. */
export default function NewStorePage() {
  const opts = useApi<any>('/options');
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [v, setV] = useState<IntakeValues>(emptyIntake);
  const [json, setJson] = useState('');
  const [result, setResult] = useState<any>(null);
  const { busy, error, run, setError } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      let body: unknown;
      if (mode === 'json') {
        try { body = JSON.parse(json); } catch { setError('That is not valid JSON'); return; }
      } else body = toIntakeJson(v);
      setResult(await api('/intake', { method: 'POST', json: body }));
    });
  };

  if (result) {
    return (
      <>
        <PageTitle title={result.created ? 'Store created' : 'Store already existed'} sub={result.store.name} />
        <div className="space-y-4">
          {result.created ? <OkNote>Created in Building. Theme, settings, 4 policy pages{result.ownerLogin ? ' and the owner login' : ''} are ready.</OkNote> : <OkNote>Same intake as before: nothing was duplicated. New details were filled in.</OkNote>}
          {result.ownerLogin?.temporaryPassword && (
            <Card title="Owner login (shown once)">
              <p className="text-sm text-ink-2">Send these to the client privately. The password is not stored anywhere readable and will not be shown again.</p>
              <dl className="mt-3 space-y-1 text-sm">
                <div><dt className="inline text-ink-2">Login: </dt><dd className="inline font-medium break-all">{result.ownerLogin.loginUrl}</dd></div>
                <div><dt className="inline text-ink-2">Email: </dt><dd className="inline font-medium">{result.ownerLogin.email}</dd></div>
                <div><dt className="inline text-ink-2">Temporary password: </dt><dd className="inline font-mono font-semibold">{result.ownerLogin.temporaryPassword}</dd></div>
              </dl>
            </Card>
          )}
          {!result.intake.complete && (
            <Card title="Still missing from the intake">
              <p className="text-sm text-ink-2">The 7-working-day clock starts when these arrive. Chasers go out on day 2, 4 and 7.</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">{result.intake.missing.map((m: string) => <li key={m} className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">{m}</li>)}</ul>
            </Card>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/stores/${result.store.id}`} className="btn-primary">Open store</Link>
            <button className="btn-secondary" onClick={() => { setResult(null); setV(emptyIntake); setJson(''); }}>Create another</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="New store from intake" sub="Creates the store in Building with theme, settings, policy pages and an owner login. Submitting the same intake twice is safe." />
      <div className="mb-4 flex gap-2">
        <button type="button" className={mode === 'form' ? 'chip-on' : 'chip'} onClick={() => setMode('form')}>Form</button>
        <button type="button" className={mode === 'json' ? 'chip-on' : 'chip'} onClick={() => setMode('json')}>Paste JSON</button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Card>
          {mode === 'form' ? (
            <IntakeForm value={v} onChange={setV} layouts={opts.data?.layouts ?? []} />
          ) : (
            <label className="block">
              <span className="label">Intake JSON</span>
              <textarea className="field min-h-72 py-3 font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} placeholder={'{\n  "intakeKey": "form-2026-0142",\n  "businessName": "…",\n  "shipping": { "mode": "FLAT", "flatRatePaise": 6000 },\n  "cod": { "enabled": true, "chargePaise": 0 }\n}'} />
              <span className="mt-1 block text-xs text-ink-3">Money in paise. intakeKey makes re-sending safe; without it, business name + email are used.</span>
            </label>
          )}
        </Card>
        <ErrorNote error={error} />
        <div className="sticky bottom-20 md:bottom-4"><button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? 'Creating…' : 'Create store'}</button></div>
      </form>
    </>
  );
}
