'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export const STAGE_STYLE: Record<string, string> = {
  intake: 'bg-amber-100 text-amber-800',
  building: 'bg-sky-100 text-sky-800',
  qa: 'bg-rose-100 text-rose-800',
  review: 'bg-violet-100 text-violet-800',
  live: 'bg-emerald-100 text-emerald-800',
  expiring: 'bg-orange-100 text-orange-800',
  parked: 'bg-zinc-200 text-zinc-700',
};

export function StageBadge({ stage, label }: { stage: string; label: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STAGE_STYLE[stage] ?? 'bg-zinc-100 text-zinc-700'}`}>{label}</span>;
}

export function Pill({ tone = 'neutral', children }: { tone?: 'ok' | 'bad' | 'warn' | 'neutral' | 'brand'; children: React.ReactNode }) {
  const t = { ok: 'bg-ok-soft text-ok', bad: 'bg-bad-soft text-bad', warn: 'bg-warn-soft text-warn', neutral: 'bg-zinc-100 text-zinc-700', brand: 'bg-brand-soft text-brand' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}

export function Card({ title, action, children, className = '' }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="h-section">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-label="Loading" />;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>;
}
export function OkNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">{children}</p>;
}

/** Load JSON from the console API; `reload()` refetches. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (n === seq.current) { setData(d); setError(null); }
    } catch (e: any) {
      if (n === seq.current) setError(e.message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Wrap an async action with busy/error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try { return await fn(); } catch (e: any) { setError(e.message); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, error, run, setError };
}

export function Meter({ value, max, label, unit }: { value: number; max: number; label: string; unit: string }) {
  const ratio = max ? Math.min(1, value / max) : 0;
  const tone = ratio >= 0.95 ? 'bg-bad' : ratio >= 0.8 ? 'bg-warn' : 'bg-brand';
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-ink-2">{label}</span><span className="font-medium">{value.toLocaleString('en-IN')} / {max.toLocaleString('en-IN')} {unit}</span></div>
      <div className="mt-1.5 h-2 rounded-full bg-zinc-100"><div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.max(2, ratio * 100)}%` }} /></div>
    </div>
  );
}

export function Kv({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2 last:border-0">
      <dt className="text-sm text-ink-2">{k}</dt>
      <dd className="text-right text-sm font-medium break-all">{children}</dd>
    </div>
  );
}
