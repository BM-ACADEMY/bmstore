'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadImages } from '@/lib/api';
import { contrast, fontFaceCss, isHex, previewDraft, storefrontOrigin, STRUCTURAL, writePreviewCookie } from '@/lib/theme-editor';
import { Card, ErrorBox, Field, Input, PageTitle, Select, Spinner, Textarea, Toggle, useLoad, useToast } from '@/components/ui';

type Vocab = Awaited<ReturnType<typeof loadVocab>>;
const loadVocab = () => api('/store/theme/vocabulary') as Promise<{
  layouts: Array<{ id: string; name: string; nameTa: string; description: string; palette: string; fontPair: string; cardStyle: string; headerStyle: string }>;
  palettes: Array<{ id: string; name: string; nameTa: string; bg: string; ink: string; primary: string; secondary: string; tertiary: string }>;
  fontPairs: Array<{ id: string; name: string; heading: string; body: string; sample: string }>;
  headerStyles: Array<{ id: string; name: string; hint: string }>; cardStyles: Array<{ id: string; name: string; hint: string }>;
  heroTypes: Array<{ id: string; name: string }>; corners: Array<{ id: string; name: string }>; sections: Array<{ id: string; name: string; hint: string }>;
}>;

/**
 * Owner theme editor. Everything here is a value from the platform vocabulary (layout, palette, fonts, header,
 * cards, hero type, corners), two hex colours, the owner's own images and words, and the order / visibility of the
 * homepage sections. The storefront on the right renders the draft live; nothing is written until "Save look".
 */
export default function ThemePage() {
  const toast = useToast();
  const theme = useLoad(() => api('/store/theme'), []);
  const vocab = useLoad(loadVocab, []);
  const [t, setT] = useState<any>(null);
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [origin, setOrigin] = useState('');
  const [previewPath, setPreviewPath] = useState('/');
  const frame = useRef<HTMLIFrameElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStructural = useRef<string>('');

  useEffect(() => { setOrigin(storefrontOrigin()); }, []);
  useEffect(() => { if (theme.data && !t) { setT(theme.data); setSaved(JSON.stringify(previewDraft(theme.data))); } }, [theme.data, t]);
  // real font faces for the samples, from the storefront's own files
  useEffect(() => { if (!origin) return; const el = document.createElement('style'); el.textContent = fontFaceCss(origin); document.head.appendChild(el); return () => { el.remove(); }; }, [origin]);
  // leaving the editor drops the preview cookie so the owner's own storefront tabs go back to the saved look
  useEffect(() => () => writePreviewCookie(null), []);

  // live preview: cookie for the server render + postMessage for instant colours; structural changes refresh the frame
  useEffect(() => {
    if (!t) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const draft = previewDraft(t);
      writePreviewCookie(JSON.stringify(draft) === saved ? null : draft); // no cookie when nothing differs from the saved look
      const structural = JSON.stringify(STRUCTURAL.map((k) => draft[k]));
      const win = frame.current?.contentWindow;
      if (win) {
        win.postMessage({ type: 'bm-theme-draft', theme: draft }, origin);
        if (lastStructural.current && structural !== lastStructural.current) win.postMessage({ type: 'bm-theme-refresh' }, origin);
      }
      lastStructural.current = structural;
    }, 250);
  }, [t, origin, saved]);

  const dirty = t && JSON.stringify(previewDraft(t)) !== saved;
  const set = useCallback((patch: Record<string, unknown>) => setT((cur: any) => ({ ...cur, ...patch })), []);
  const setOpt = (patch: Record<string, unknown>) => set({ options: { ...t.options, ...patch } });
  const setSection = (type: string, patch: Record<string, unknown>) => set({ homepageSections: t.homepageSections.map((s: any) => (s.type === type ? { ...s, ...patch } : s)) });
  const move = (from: number, to: number) => { if (to < 0 || to >= t.homepageSections.length) return; const next = [...t.homepageSections]; const [s] = next.splice(from, 1); next.splice(to, 0, s); set({ homepageSections: next }); };

  const save = async () => {
    setBusy(true); setProblems([]);
    try {
      const body = previewDraft(t);
      const res = await api('/store/theme', { method: 'PUT', json: { ...body, homepageSections: t.homepageSections } });
      setT(res); setSaved(JSON.stringify(previewDraft(res)));
      writePreviewCookie(null);
      frame.current?.contentWindow?.postMessage({ type: 'bm-theme-refresh' }, origin);
      toast.push('Look saved. Shoppers see it within a minute.');
    } catch (e: any) {
      const list = Array.isArray(e.body?.message) ? e.body.message : [e.message];
      setProblems(list); toast.push('Could not save: see the list above the button', 'bad');
    } finally { setBusy(false); }
  };
  const discard = () => { if (theme.data) { setT(theme.data); writePreviewCookie(null); frame.current?.contentWindow?.postMessage({ type: 'bm-theme-refresh' }, origin); } };

  const upload = async (files: FileList | null, kind: string, onDone: (urls: string[]) => void) => {
    if (!files?.length) return;
    try { const rows = await uploadImages([...files], kind); onDone(rows.map((m) => m.url)); toast.push('Uploaded. Save to keep it.'); } catch (e: any) { toast.push(e.message, 'bad'); }
  };

  if (theme.error || vocab.error) return <ErrorBox message={theme.error ?? vocab.error ?? ''} retry={() => { theme.reload(); vocab.reload(); }} />;
  if (!t || !vocab.data) return <Spinner />;
  const v = vocab.data as Vocab;
  const palette = v.palettes.find((p) => p.id === t.paletteId);
  const bg = palette?.bg ?? '#F8F6F2';
  const textOnPrimary = contrast(t.primaryColor, '#ffffff') >= 4.5 ? '#ffffff' : (palette?.ink ?? '#1F1D1A');
  const primaryOnBg = contrast(t.primaryColor, bg);
  const previewSrc = origin ? `${origin}${previewPath}` : '';

  const editor = (
    <div className="flex flex-col gap-4">
      {/* Layout */}
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Layout</h2>
        <p className="text-sm text-ink-3 -mt-2">Same products, same links: only the composition changes. Picking a layout also suggests its palette and fonts; you can change them below.</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3" role="radiogroup" aria-label="Layout">
          {v.layouts.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={t.layoutVariant === l.id} onClick={() => set({ layoutVariant: l.id, cardStyle: l.cardStyle, headerStyle: l.headerStyle, ...(t.paletteId !== 'custom' ? { paletteId: l.palette, primaryColor: v.palettes.find((p) => p.id === l.palette)!.primary, secondaryColor: v.palettes.find((p) => p.id === l.palette)!.secondary } : {}), fontPairId: l.fontPair })}
              className={`text-left rounded-xl border-2 p-3 min-h-[5.5rem] ${t.layoutVariant === l.id ? 'border-brand bg-brand-soft' : 'border-line bg-card'}`}>
              <LayoutGlyph id={l.id} />
              <div className="mt-2 font-semibold text-sm">{l.name} <span className="text-ink-3 font-normal">· {l.nameTa}</span></div>
              <div className="text-xs text-ink-3 mt-0.5 leading-snug">{l.description}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Colours */}
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Colours</h2>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Palette">
          {v.palettes.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={t.paletteId === p.id} onClick={() => set({ paletteId: p.id, primaryColor: p.primary, secondaryColor: p.secondary })} className={`rounded-xl border-2 p-1.5 ${t.paletteId === p.id ? 'border-ink' : 'border-line'}`} aria-label={p.name} title={`${p.name} · ${p.nameTa}`} style={{ background: p.bg }}>
              <div className="h-9 rounded-lg overflow-hidden flex"><span className="flex-1" style={{ background: p.primary }} /><span className="w-3" style={{ background: p.secondary }} /><span className="w-2" style={{ background: p.tertiary }} /></div>
              <div className="text-[10px] mt-1 text-center leading-tight truncate" style={{ color: p.ink }}>{p.name}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Main colour (buttons, headings)"><div className="flex gap-2 items-center"><input type="color" aria-label="Main colour picker" value={isHex(t.primaryColor) ? t.primaryColor : '#000000'} onChange={(e) => set({ primaryColor: e.target.value.toUpperCase(), paletteId: 'custom' })} className="h-12 w-14 rounded-xl border border-line bg-card p-1" /><Input aria-label="Main colour hex" value={t.primaryColor} onChange={(e) => set({ primaryColor: e.target.value, paletteId: 'custom' })} /></div></Field>
          <Field label="Accent colour (badges, borders)"><div className="flex gap-2 items-center"><input type="color" aria-label="Accent colour picker" value={isHex(t.secondaryColor) ? t.secondaryColor : '#000000'} onChange={(e) => set({ secondaryColor: e.target.value.toUpperCase(), paletteId: 'custom' })} className="h-12 w-14 rounded-xl border border-line bg-card p-1" /><Input aria-label="Accent colour hex" value={t.secondaryColor} onChange={(e) => set({ secondaryColor: e.target.value, paletteId: 'custom' })} /></div></Field>
        </div>
        <div className="rounded-xl p-4 border border-line" style={{ background: bg }}>
          <div className="flex items-center justify-between gap-3">
            <div style={{ color: t.primaryColor }} className="font-bold">Heading in your main colour</div>
            <span className="inline-block rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: t.primaryColor, color: textOnPrimary }}>Add to cart</span>
          </div>
          <p className={`mt-2 text-xs ${primaryOnBg >= 4.5 ? 'text-ok' : 'text-note'}`}>{primaryOnBg >= 4.5 ? `Readable: ${primaryOnBg.toFixed(1)}:1 contrast on the page background.` : `Light main colour (${primaryOnBg.toFixed(1)}:1): the shop darkens it automatically where it is used as text.`}</p>
        </div>
      </Card>

      {/* Fonts */}
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Fonts</h2>
        <p className="text-sm text-ink-3 -mt-2">All six show Tamil and English properly.</p>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Fonts">
          {v.fontPairs.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={t.fontPairId === f.id} onClick={() => set({ fontPairId: f.id })} className={`text-left rounded-xl border-2 px-3 py-2.5 ${t.fontPairId === f.id ? 'border-brand bg-brand-soft' : 'border-line bg-card'}`}>
              <div className="text-[22px] leading-tight" style={{ fontFamily: `${f.heading}, "Noto Sans Tamil"` }}>Pattu Sarees · பட்டுப் புடவைகள்</div>
              <div className="text-sm mt-1" style={{ fontFamily: `${f.body}, "Noto Sans Tamil"` }}>₹8,499 · {f.sample}</div>
              <div className="text-xs text-ink-3 mt-1">{f.name}</div>
            </button>
          ))}
        </div>
      </Card>

      {/* Header, cards, corners */}
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Header, cards and corners</h2>
        <ChoiceRow label="Header" items={v.headerStyles} value={t.headerStyle} onChange={(id) => set({ headerStyle: id })} />
        <ChoiceRow label="Product cards" items={v.cardStyles} value={t.cardStyle} onChange={(id) => set({ cardStyle: id })} />
        <ChoiceRow label="Corners" items={v.corners} value={t.options.corners} onChange={(id) => setOpt({ corners: id })} />
      </Card>

      {/* Logo, hero */}
      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Logo and hero</h2>
        <div className="flex items-center gap-4">
          {t.logoUrl ? <img src={t.logoUrl} alt="Logo" className="h-16 w-16 rounded-2xl object-cover bg-paper border border-line" /> : <div className="h-16 w-16 rounded-2xl bg-paper border border-dashed border-line grid place-items-center text-ink-3 text-xs">No logo</div>}
          <label className="btn-secondary cursor-pointer">{t.logoUrl ? 'Change logo' : 'Upload logo'}<input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files, 'logo', ([u]) => set({ logoUrl: u }))} /></label>
          {t.logoUrl && <button type="button" className="btn-ghost text-bad h-10 min-h-0" onClick={() => set({ logoUrl: null })}>Remove</button>}
        </div>
        <ChoiceRow label="Hero type" items={v.heroTypes} value={t.heroType} onChange={(id) => set({ heroType: id })} />
        {t.heroType === 'video' && <Field label="Video link (https, mp4 or webm you host)" hint="Plays muted and looped; the first banner is the poster."><Input value={t.options.heroVideoUrl ?? ''} onChange={(e) => setOpt({ heroVideoUrl: e.target.value || null })} placeholder="https://…/hero.mp4" /></Field>}
        <div>
          <div className="label">Banners {t.heroType === 'slider' ? '(all of them slide)' : '(the first one shows)'}</div>
          <ul className="flex flex-col gap-2">
            {t.bannerUrls.map((u: string, i: number) => (
              <li key={u} className="flex items-center gap-2">
                <img src={u} alt="" className="h-12 w-20 rounded-lg object-cover border border-line" />
                <span className="text-xs text-ink-3 flex-1 truncate">{u.split('/').pop()}</span>
                <button type="button" className="tap w-11 rounded-xl border border-line" aria-label="Move banner up" disabled={i === 0} onClick={() => { const b = [...t.bannerUrls]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; set({ bannerUrls: b }); }}>↑</button>
                <button type="button" className="tap w-11 rounded-xl border border-line" aria-label="Move banner down" disabled={i === t.bannerUrls.length - 1} onClick={() => { const b = [...t.bannerUrls]; [b[i + 1], b[i]] = [b[i], b[i + 1]]; set({ bannerUrls: b }); }}>↓</button>
                <button type="button" className="tap w-11 rounded-xl border border-line text-bad" aria-label="Remove banner" onClick={() => set({ bannerUrls: t.bannerUrls.filter((x: string) => x !== u) })}>×</button>
              </li>
            ))}
          </ul>
          <label className="btn-secondary cursor-pointer mt-2 inline-flex">Add banners<input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => upload(e.target.files, 'banner', (urls) => set({ bannerUrls: [...t.bannerUrls, ...urls].slice(0, 10) }))} /></label>
          <p className="text-xs text-ink-3 mt-1">Wide images work best (1800×1000). Up to 10.</p>
        </div>
      </Card>

      {/* Sections */}
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Home page sections</h2>
        <p className="text-sm text-ink-3 -mt-2">Drag to reorder (or use the arrows), switch sections on and off, and fill in your words. Sections with nothing to show stay hidden.</p>
        <ol className="flex flex-col gap-2">
          {t.homepageSections.map((s: any, i: number) => (
            <SectionRow key={s.type} s={s} i={i} count={t.homepageSections.length} meta={v.sections.find((x) => x.id === s.type)} onMove={move} onChange={(patch) => setSection(s.type, patch)} onUpload={(files, cb) => upload(files, 'banner', cb)} />
          ))}
        </ol>
      </Card>

      {/* Demo switcher */}
      <Card>
        <Toggle checked={Boolean(t.options.switcherEnabled)} onChange={(on) => setOpt({ switcherEnabled: on })} label="Show a theme switcher to visitors" hint="For demo stores only: a floating button lets visitors try other layouts and palettes on their own screen. Your saved look is unchanged." />
      </Card>

      {problems.length > 0 && <div role="alert" className="rounded-xl bg-bad-soft text-bad px-4 py-3 text-sm"><div className="font-semibold mb-1">Please fix:</div><ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      <div className="sticky bottom-20 lg:bottom-4 z-10 flex gap-2 bg-paper/90 backdrop-blur py-2 -mx-1 px-1 rounded-xl">
        <button className="btn-primary flex-1" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save look' : 'Saved'}</button>
        <button className="btn-secondary" disabled={busy || !dirty} onClick={discard}>Discard</button>
        <button className="btn-secondary lg:hidden" onClick={() => setShowPreview(true)}>Preview</button>
      </div>
    </div>
  );

  const preview = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b border-line bg-card">
        <Select value={previewPath} onChange={(e) => setPreviewPath(e.target.value)} className="h-10 min-h-10 text-sm" aria-label="Preview page">
          <option value="/">Home</option><option value="/c/all">All products</option><option value="/cart">Cart</option>
        </Select>
        <span className="text-xs text-ink-3 flex-1 truncate">{dirty ? 'Previewing unsaved changes' : 'Saved look'}</span>
        <button type="button" className="btn-secondary h-10 min-h-10 px-3 lg:hidden" onClick={() => setShowPreview(false)}>Close</button>
      </div>
      <div className="flex-1 bg-paper lg:grid lg:place-items-center lg:p-2 overflow-hidden min-h-0">
        <div className="h-full w-full lg:w-[390px] lg:max-h-[844px] lg:rounded-[28px] lg:border-[6px] lg:border-ink/90 overflow-hidden bg-white lg:shadow-card">
          {previewSrc && <iframe ref={frame} title="Store preview" src={previewSrc} className="w-full h-full" />}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Look & layout" back="/settings" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-start">
        {editor}
        <div className="hidden lg:block sticky top-4 h-[calc(100dvh-2rem)] card overflow-hidden">{preview}</div>
      </div>
      {showPreview && <div className="fixed inset-0 z-[70] bg-paper lg:hidden flex flex-col">{preview}</div>}
    </div>
  );
}

function ChoiceRow({ label, items, value, onChange }: { label: string; items: Array<{ id: string; name: string; hint?: string }>; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`grid gap-2 ${items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`} role="radiogroup" aria-label={label}>
        {items.map((it) => (
          <button key={it.id} type="button" role="radio" aria-checked={value === it.id} onClick={() => onChange(it.id)} className={`text-left rounded-xl border-2 px-3 py-2 min-h-12 ${value === it.id ? 'border-brand bg-brand-soft' : 'border-line bg-card'}`}>
            <div className="text-sm font-semibold">{it.name}</div>
            {it.hint && <div className="text-xs text-ink-3 leading-snug">{it.hint}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionRow({ s, i, count, meta, onMove, onChange, onUpload }: { s: any; i: number; count: number; meta?: { name: string; hint: string }; onMove: (from: number, to: number) => void; onChange: (patch: Record<string, unknown>) => void; onUpload: (files: FileList | null, cb: (urls: string[]) => void) => void }) {
  const [open, setOpen] = useState(false);
  const hasFields = ['hero', 'offer_strip', 'featured', 'about'].includes(s.type);
  return (
    <li draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (!Number.isNaN(from) && from !== i) onMove(from, i); }}
      className={`rounded-xl border ${s.enabled ? 'border-line bg-card' : 'border-dashed border-line bg-paper'}`}>
      <div className="flex items-center gap-1 p-2">
        <span className="cursor-grab text-ink-3 px-1 select-none" aria-hidden>⋮⋮</span>
        <button type="button" className="flex-1 text-left min-h-11 px-1" onClick={() => hasFields && setOpen((o) => !o)} aria-expanded={hasFields ? open : undefined}>
          <div className={`font-medium text-sm ${s.enabled ? '' : 'text-ink-3'}`}>{meta?.name ?? s.type}{hasFields && <span className="text-ink-3 font-normal"> · {open ? 'hide' : 'edit text'}</span>}</div>
          <div className="text-xs text-ink-3">{meta?.hint}</div>
        </button>
        <button type="button" className="tap w-11 rounded-xl border border-line" aria-label={`Move ${meta?.name ?? s.type} up`} disabled={i === 0} onClick={() => onMove(i, i - 1)}>↑</button>
        <button type="button" className="tap w-11 rounded-xl border border-line" aria-label={`Move ${meta?.name ?? s.type} down`} disabled={i === count - 1} onClick={() => onMove(i, i + 1)}>↓</button>
        <button type="button" role="switch" aria-checked={s.enabled} aria-label={`${meta?.name ?? s.type} visible`} onClick={() => onChange({ enabled: !s.enabled })} className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ml-1 ${s.enabled ? 'bg-brand' : 'bg-line'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${s.enabled ? 'left-6' : 'left-1'}`} /></button>
      </div>
      {open && hasFields && (
        <div className="border-t border-line p-3 grid gap-3 sm:grid-cols-2">
          {s.type === 'hero' && <>
            <Field label="Tagline"><Input value={s.tagline ?? ''} onChange={(e) => onChange({ tagline: e.target.value })} maxLength={300} /></Field>
            <Field label="Tagline (Tamil)"><Input value={s.taglineTa ?? ''} onChange={(e) => onChange({ taglineTa: e.target.value })} maxLength={300} lang="ta" /></Field>
            <Field label="Button text" hint="Default: Shop the collection"><Input value={s.ctaLabel ?? ''} onChange={(e) => onChange({ ctaLabel: e.target.value })} maxLength={60} /></Field>
            <Field label="Button link" hint="e.g. /c/sarees"><Input value={s.ctaHref ?? ''} onChange={(e) => onChange({ ctaHref: e.target.value })} /></Field>
          </>}
          {s.type === 'offer_strip' && <>
            <Field label="Text" hint="Empty = your delivery rule"><Input value={s.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} maxLength={300} /></Field>
            <Field label="Text (Tamil)"><Input value={s.textTa ?? ''} onChange={(e) => onChange({ textTa: e.target.value })} maxLength={300} lang="ta" /></Field>
            <Field label="Link (optional)"><Input value={s.href ?? ''} onChange={(e) => onChange({ href: e.target.value })} /></Field>
          </>}
          {s.type === 'featured' && <>
            <Field label="Title" hint="Default: New arrivals"><Input value={s.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} maxLength={80} /></Field>
            <Field label="Title (Tamil)"><Input value={s.titleTa ?? ''} onChange={(e) => onChange({ titleTa: e.target.value })} maxLength={80} lang="ta" /></Field>
            <div className="sm:col-span-2"><FeaturedPicker ids={s.productIds ?? []} onChange={(productIds) => onChange({ productIds })} /></div>
          </>}
          {s.type === 'about' && <>
            <Field label="Title" hint="Default: your store name"><Input value={s.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} maxLength={80} /></Field>
            <Field label="Title (Tamil)"><Input value={s.titleTa ?? ''} onChange={(e) => onChange({ titleTa: e.target.value })} maxLength={80} lang="ta" /></Field>
            <Field label="Your story"><Textarea value={s.body ?? ''} onChange={(e) => onChange({ body: e.target.value })} maxLength={2000} /></Field>
            <Field label="Your story (Tamil)"><Textarea value={s.bodyTa ?? ''} onChange={(e) => onChange({ bodyTa: e.target.value })} maxLength={2000} lang="ta" /></Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              {s.imageUrl && <img src={s.imageUrl} alt="" className="h-14 w-20 rounded-lg object-cover border border-line" />}
              <label className="btn-secondary cursor-pointer">{s.imageUrl ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*" className="sr-only" onChange={(e) => onUpload(e.target.files, ([u]) => onChange({ imageUrl: u }))} /></label>
              {s.imageUrl && <button type="button" className="btn-ghost text-bad h-10 min-h-0" onClick={() => onChange({ imageUrl: null })}>Remove</button>}
            </div>
          </>}
        </div>
      )}
    </li>
  );
}

/** Pick the products for "Featured" (empty = newest). */
function FeaturedPicker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useLoad(() => api('/store/products?pageSize=100&status=ACTIVE'), []);
  const items: Array<{ id: string; name: string }> = data?.items ?? [];
  const picked = useMemo(() => new Set(ids), [ids]);
  if (!items.length) return <p className="text-xs text-ink-3">Add products first; the newest ones show until you pick.</p>;
  return (
    <div>
      <div className="label">Featured products <span className="text-ink-3 font-normal">({ids.length ? `${ids.length} picked, in this order` : 'none picked: newest 8 show'})</span></div>
      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-0.5">
        {items.map((p) => <button key={p.id} type="button" aria-pressed={picked.has(p.id)} onClick={() => onChange(picked.has(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id].slice(0, 24))} className={`h-9 px-3 rounded-full border text-xs font-medium ${picked.has(p.id) ? 'bg-ink text-white border-ink' : 'bg-card border-line'}`}>{p.name}</button>)}
      </div>
    </div>
  );
}

/** Tiny wireframe of each layout so the choice reads at a glance. */
function LayoutGlyph({ id }: { id: string }) {
  const c = 'fill-ink/15';
  return (
    <svg viewBox="0 0 96 56" className="w-24 h-14 rounded-md bg-paper border border-line" aria-hidden>
      <rect x="4" y="4" width="88" height="6" rx="1.5" className="fill-ink/25" />
      {id === 'v1-textile' && <><rect x="4" y="13" width="88" height="20" rx="3" className="fill-brand/60" /><circle cx="14" cy="42" r="6" className={c} /><circle cx="32" cy="42" r="6" className={c} /><circle cx="50" cy="42" r="6" className={c} /><circle cx="68" cy="42" r="6" className={c} /></>}
      {id === 'v2-grocer' && <><rect x="4" y="13" width="88" height="10" rx="2" className="fill-brand/60" /><rect x="4" y="26" width="42" height="11" rx="2" className={c} /><rect x="50" y="26" width="42" height="11" rx="2" className={c} /><rect x="4" y="40" width="20" height="12" rx="2" className={c} /><rect x="27" y="40" width="20" height="12" rx="2" className={c} /><rect x="50" y="40" width="20" height="12" rx="2" className={c} /><rect x="73" y="40" width="19" height="12" rx="2" className={c} /></>}
      {id === 'v3-retail' && <><rect x="0" y="12" width="96" height="22" className="fill-brand/60" /><rect x="4" y="37" width="88" height="4" rx="1" className="fill-ink/25" /><rect x="4" y="44" width="27" height="9" rx="2" className={c} /><rect x="34" y="44" width="27" height="9" rx="2" className={c} /><rect x="65" y="44" width="27" height="9" rx="2" className={c} /></>}
    </svg>
  );
}
