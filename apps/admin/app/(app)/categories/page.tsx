'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Card, ErrorBox, Input, PageTitle, Spinner, useLoad, useToast } from '@/components/ui';

interface Cat { id: string; name: string; nameTa: string | null; slug: string; parentId: string | null; productCount: number }

/** Categories: the Tamil label shown on storefront tiles and menus next to (or instead of) the English name. */
export default function CategoriesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api('/store/categories'), []);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <ErrorBox message={error} retry={reload} />;
  if (loading && !data) return <Spinner />;
  const items: Cat[] = data?.items ?? [];
  const save = async (c: Cat) => {
    setBusy(c.id);
    try { await api(`/store/categories/${c.id}`, { method: 'PATCH', json: { nameTa: edits[c.id]?.trim() || null } }); toast.push(`${c.name} saved`); setEdits((e) => { const n = { ...e }; delete n[c.id]; return n; }); reload(); }
    catch (e: any) { toast.push(e.message, 'bad'); } finally { setBusy(null); }
  };
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Categories" sub="Tamil labels for tiles and menus" back="/more" />
      {!items.length && <Card>No categories yet. They are created when you add or import products.</Card>}
      <ul className="flex flex-col gap-2">
        {items.map((c) => {
          const val = edits[c.id] ?? c.nameTa ?? '';
          const dirty = edits[c.id] !== undefined && (edits[c.id] ?? '') !== (c.nameTa ?? '');
          return (
            <li key={c.id} className="card p-3 flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3"><span className={`font-semibold ${c.parentId ? 'pl-4 text-ink-2' : ''}`}>{c.parentId ? '— ' : ''}{c.name}</span><span className="text-xs text-ink-3">{c.productCount} products · /c/{c.slug}</span></div>
              <div className="flex gap-2">
                <Input lang="ta" aria-label={`Tamil label for ${c.name}`} placeholder="தமிழ் பெயர்" value={val} onChange={(e) => setEdits((x) => ({ ...x, [c.id]: e.target.value }))} maxLength={80} />
                <button type="button" className="btn-primary px-4" disabled={!dirty || busy === c.id} onClick={() => save(c)}>{busy === c.id ? '…' : 'Save'}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
