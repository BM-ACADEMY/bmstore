'use client';

import { useRef, useState } from 'react';
import { Card, ErrorNote, OkNote, Pill, Spinner, useAction, useApi } from '@/components/ui';
import { api, uploadImages } from '@/lib/api';
import { plural } from '@/lib/format';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function BuildSection({ s, reload }: { s: any; reload: () => void }) {
  return (
    <div className="space-y-4">
      <CatalogSummary id={s.id} />
      <ImportCard id={s.id} onDone={reload} />
      <ImagesCard id={s.id} onDone={reload} />
      <ThemeCard id={s.id} />
      <PoliciesCard s={s} onDone={reload} />
    </div>
  );
}

function CatalogSummary({ id }: { id: string }) {
  const { data } = useApi<any>(`/stores/${id}/catalog`);
  if (!data) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {[['Products', data.products], ['Live', data.live], ['Without photos', data.withoutImages]].map(([k, v]) => (
        <div key={k as string} className="card p-3"><p className="text-xs text-ink-2">{k}</p><p className="text-xl font-semibold">{(v as number).toLocaleString('en-IN')}</p></div>
      ))}
    </div>
  );
}

function ImportCard({ id, onDone }: { id: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'create' | 'upsert'>('create');
  const [draft, setDraft] = useState(false);
  const [report, setReport] = useState<any>(null);
  const { busy, error, run } = useAction();

  const send = (dryRun: boolean) => file && run(async () => {
    const qs = new URLSearchParams({ filename: file.name, mode, ...(dryRun ? { dryRun: 'true' } : {}), ...(draft ? { status: 'DRAFT' } : {}) });
    const type = file.name.toLowerCase().endsWith('.xlsx') ? XLSX : 'text/csv';
    setReport(await api(`/stores/${id}/import/products?${qs}`, { method: 'POST', headers: { 'content-type': type }, body: await file.arrayBuffer() }));
    if (!dryRun) onDone();
  });

  return (
    <Card title="Import the product sheet" action={<span className="flex gap-3 text-sm"><a className="font-medium text-brand" href="/api/import/template?format=xlsx">Excel template</a><a className="font-medium text-brand" href="/api/import/template?format=csv">CSV</a></span>}>
      <div className="space-y-3">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }} />
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={mode === 'upsert'} onChange={(e) => setMode(e.target.checked ? 'upsert' : 'create')} /> Update products with the same SKU</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} /> Import as drafts</label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!file || busy} onClick={() => send(true)}>Check first</button>
          <button className="btn-primary" disabled={!file || busy} onClick={() => send(false)}>{busy ? 'Working…' : 'Import'}</button>
        </div>
        <ErrorNote error={error} />
        {report && <ImportReport r={report} />}
      </div>
    </Card>
  );
}

function ImportReport({ r }: { r: any }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {r.dryRun && <Pill tone="brand">Check only, nothing saved</Pill>}
        <Pill tone="ok">{r.dryRun ? `${r.imported + r.updated} ready` : `${r.imported} added, ${r.updated} updated`}</Pill>
        {r.failed > 0 && <Pill tone="bad">{plural(r.failed, 'row')} with problems</Pill>}
        <span className="text-ink-3">{plural(r.totalRows, 'row')} read</span>
      </div>
      {r.errors.length > 0 && (
        <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-sm">
          {r.errors.map((e: any, i: number) => <li key={i} className="rounded-lg bg-bad-soft px-2.5 py-1.5 text-bad"><span className="font-semibold">Row {e.row}:</span> {e.reason}</li>)}
        </ul>
      )}
      {r.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">{r.warnings.slice(0, 50).map((w: any, i: number) => <li key={i} className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-warn"><span className="font-semibold">Row {w.row}:</span> {w.reason}</li>)}</ul>
      )}
    </div>
  );
}

function ImagesCard({ id, onDone }: { id: string; onDone: () => void }) {
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<any[] | null>(null);
  const { busy, error, run } = useAction();
  const upload = (files: File[]) => run(async () => {
    setDone(null);
    const out = await uploadImages(id, files, 'product', (d, t, phase) => setProgress(`${phase} ${d} of ${t}`));
    setDone(out);
    setProgress(null);
    onDone();
  });
  return (
    <Card title="Product photos (bulk)">
      <p className="mb-3 text-sm text-ink-2">Name files like the sheet's <code>image_filename</code> column, upload them, then import (or re-import with "update") to attach them. Photos are converted to WebP automatically.</p>
      <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-semibold file:text-brand" onChange={(e) => e.target.files?.length && upload(Array.from(e.target.files))} />
      {progress && <p className="mt-3 flex items-center gap-2 text-sm text-ink-2"><Spinner className="h-4 w-4" /> {progress}</p>}
      {done && <div className="mt-3"><OkNote>{done.filter((m) => m.status === 'READY').length} of {done.length} photos ready{done.some((m) => m.status === 'FAILED') ? `; failed: ${done.filter((m) => m.status === 'FAILED').map((m) => m.filename).join(', ')}` : ''}.</OkNote></div>}
      <ErrorNote error={error} />
    </Card>
  );
}

function ThemeCard({ id }: { id: string }) {
  const opts = useApi<any>('/options');
  const theme = useApi<any>(`/stores/${id}/theme`);
  const logos = useApi<any>(`/stores/${id}/media?kind=logo&status=READY&pageSize=20`);
  const [layout, setLayout] = useState('');
  const [c1, setC1] = useState('');
  const [c2, setC2] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const t = theme.data;

  const apply = (extra: Record<string, unknown> = {}) => run(async () => {
    const body: Record<string, unknown> = { ...extra };
    if (layout) body.layout = layout;
    if (c1) body.primaryColor = c1;
    if (c2) body.secondaryColor = c2;
    await api(`/stores/${id}/theme`, { method: 'PUT', json: body });
    setMsg('Theme applied');
    theme.reload();
  });
  const uploadLogo = (f: File) => run(async () => {
    const [m] = await uploadImages(id, [f], 'logo');
    if (m?.status !== 'READY') throw new Error('Logo could not be processed');
    await api(`/stores/${id}/theme`, { method: 'PUT', json: { logoUrl: m.url } });
    setMsg('Logo set');
    theme.reload();
    logos.reload();
  });

  return (
    <Card title="Theme">
      {t && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-line p-3">
          {t.logoUrl ? <img src={t.logoUrl} alt="Logo" className="h-12 w-12 rounded-lg object-contain" /> : <div className="grid h-12 w-12 place-items-center rounded-lg bg-zinc-100 text-xs text-ink-3">No logo</div>}
          <div className="text-sm">
            <p className="font-medium capitalize">{t.layoutVariant} layout</p>
            <p className="flex items-center gap-1.5 text-ink-2"><span className="inline-block h-4 w-4 rounded" style={{ background: t.primaryColor }} />{t.primaryColor}<span className="ml-2 inline-block h-4 w-4 rounded" style={{ background: t.secondaryColor }} />{t.secondaryColor}</p>
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label><span className="label">Layout</span>
          <select className="field" value={layout} onChange={(e) => setLayout(e.target.value)}>
            <option value="">Keep current</option>
            {(opts.data?.layouts ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label><span className="label">Primary colour</span><input className="field" placeholder={t?.primaryColor} value={c1} onChange={(e) => setC1(e.target.value)} /></label>
        <label><span className="label">Secondary colour</span><input className="field" placeholder={t?.secondaryColor} value={c2} onChange={(e) => setC2(e.target.value)} /></label>
      </div>
      <p className="mt-2 text-xs text-ink-3">A layout resets fonts, header, cards and homepage sections to that layout's defaults; colours you enter win.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={busy || (!layout && !c1 && !c2)} onClick={() => apply()}>Apply theme</button>
        <label className="btn-secondary cursor-pointer">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} /></label>
      </div>
      {msg && !error && <div className="mt-3"><OkNote>{msg}</OkNote></div>}
      <div className="mt-3"><ErrorNote error={error} /></div>
    </Card>
  );
}

function PoliciesCard({ s, onDone }: { s: any; onDone: () => void }) {
  const [res, setRes] = useState<any[] | null>(null);
  const { busy, error, run } = useAction();
  const gen = (overwrite: boolean) => run(async () => { setRes(await api(`/stores/${s.id}/policies`, { method: 'POST', json: { overwrite } })); onDone(); });
  return (
    <Card title="Policy pages">
      <p className="text-sm text-ink-2">Privacy, Terms, Refund and Shipping, written from this store's details (contact, GST, shipping, COD). {s.policies.length} of 4 present.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy} onClick={() => gen(false)}>Create missing</button>
        <button className="btn-secondary" disabled={busy} onClick={() => confirm('Rewrite all four policy pages from the current store details? Edits made to them will be replaced.') && gen(true)}>Regenerate all</button>
      </div>
      {res && <ul className="mt-3 space-y-1 text-sm">{res.map((p) => <li key={p.slug} className="flex justify-between"><span>{p.title}</span><span className="text-ink-2">{p.action}</span></li>)}</ul>}
      <div className="mt-3"><ErrorNote error={error} /></div>
    </Card>
  );
}
