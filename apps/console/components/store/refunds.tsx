'use client';

import { useState } from 'react';
import { Card, ErrorNote, Field, Pill, useAction, useApi } from '@/components/ui';
import { api } from '@/lib/api';
import { date, rupees, toPaise } from '@/lib/format';

const STATUS_TONE: Record<string, 'ok' | 'bad' | 'warn' | 'neutral' | 'brand'> = { open: 'warn', processing: 'brand', refunded: 'ok', rejected: 'neutral', failed: 'bad' };
const REASONS = [{ id: 'not_delivered', label: 'Store not delivered on time' }, { id: 'change_of_mind', label: 'Client changed their mind' }, { id: 'other', label: 'Other' }];

/** Refund helper: the facts, the policy rule's verdict, a human approval, then Razorpay (test mode) and a credit note. */
export function RefundSection({ s }: { s: any }) {
  const list = useApi<any[]>(`/stores/${s.id}/refunds`);
  const [f, setF] = useState({ reason: 'not_delivered', amount: '', gst: '', delay: '0', delayNote: '', paymentId: '', invoiceRef: '', note: '' });
  const [preview, setPreview] = useState<any>(null);
  const { busy, error, run, setError } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPreview(null); };

  const body = () => {
    try {
      return {
        reason: f.reason, amountPaidPaise: toPaise(f.amount), gstPaise: toPaise(f.gst || '0'), clientDelayWorkingDays: Number(f.delay || 0),
        ...(f.delayNote ? { clientDelayNote: f.delayNote } : {}), ...(f.paymentId ? { paymentId: f.paymentId.trim() } : {}), ...(f.invoiceRef ? { invoiceRef: f.invoiceRef.trim() } : {}), ...(f.note ? { note: f.note } : {}),
      };
    } catch (e: any) { setError(e.message); return null; }
  };
  const check = () => { const b = body(); if (b) run(async () => setPreview(await api(`/stores/${s.id}/refunds/preview`, { method: 'POST', json: b }))); };
  const open = () => { const b = body(); if (b) run(async () => { await api(`/stores/${s.id}/refunds`, { method: 'POST', json: b }); setPreview(null); list.reload(); }); };

  return (
    <div className="space-y-4">
      <Card title="Open a refund case">
        <p className="mb-3 text-sm text-ink-2">The store-delivery guarantee: live within 7 working days of a completed intake, or a full refund including GST with a credit note. Client-side delays and change of mind after go-live are not covered.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reason"><select className="field" value={f.reason} onChange={set('reason')}>{REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
          <Field label="Razorpay payment id" hint="pay_… of the client's setup fee"><input className="field" value={f.paymentId} onChange={set('paymentId')} /></Field>
          <Field label="Amount paid incl. GST (₹)"><input className="field" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
          <Field label="GST in that amount (₹)"><input className="field" inputMode="decimal" value={f.gst} onChange={set('gst')} /></Field>
          <Field label="Client-side delay (working days)" hint="Late details, Razorpay KYC: pushes the deadline out"><input className="field" inputMode="numeric" value={f.delay} onChange={set('delay')} /></Field>
          <Field label="What the delay was"><input className="field" value={f.delayNote} onChange={set('delayNote')} /></Field>
          <Field label="Our invoice number"><input className="field" value={f.invoiceRef} onChange={set('invoiceRef')} /></Field>
          <Field label="Note"><input className="field" value={f.note} onChange={set('note')} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy || !f.amount} onClick={check}>Apply the rule</button>
          <button className="btn-primary" disabled={busy || !f.amount} onClick={open}>Open case</button>
        </div>
        {preview && <Verdict d={preview} />}
        <div className="mt-3"><ErrorNote error={error} /></div>
      </Card>

      {(list.data ?? []).map((c) => <CaseCard key={c.id} c={c} storeId={s.id} onChange={list.reload} />)}
    </div>
  );
}

function Verdict({ d }: { d: any }) {
  return (
    <div className={`mt-3 rounded-xl border p-3 ${d.eligible ? 'border-ok/30 bg-ok-soft' : 'border-line bg-bg'}`}>
      <p className="font-semibold">{d.eligible ? `Eligible: refund ${rupees(d.refundPaise)}` : 'Not eligible under the policy'}</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-ink-2">{d.explanation.map((e: string, i: number) => <li key={i}>{e}</li>)}</ol>
    </div>
  );
}

function CaseCard({ c, storeId, onChange }: { c: any; storeId: string; onChange: () => void }) {
  const [confirmAmt, setConfirmAmt] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run, setError } = useAction();
  const approve = () => {
    let p: number;
    try { p = toPaise(confirmAmt); } catch (e: any) { setError(e.message); return; }
    run(async () => { await api(`/stores/${storeId}/refunds/${c.id}/approve`, { method: 'POST', json: { confirmPaise: p } }); onChange(); });
  };
  const reject = () => run(async () => { await api(`/stores/${storeId}/refunds/${c.id}/reject`, { method: 'POST', json: { note } }); onChange(); });
  const actionable = c.status === 'open' || c.status === 'failed';

  return (
    <Card title={`${rupees(c.amountPaidPaise)} · opened ${date(c.createdAt)}`} action={<Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>}>
      <Verdict d={c.decision} />
      {c.refundError && <p className="mt-2 text-sm text-bad">{c.refundError}</p>}
      {c.status === 'refunded' && (
        <div className="mt-3 text-sm">
          <p>Refund {c.refundStub ? <Pill tone="warn">simulated (no Razorpay keys)</Pill> : <span className="font-mono">{c.refundId}</span>} · process by {date(c.processBy)}</p>
          <a className="mt-1 inline-block font-medium text-brand" href={`/api/stores/${storeId}/refunds/${c.id}/credit-note`} target="_blank" rel="noreferrer">Credit note {c.creditNoteNo}</a>
        </div>
      )}
      {actionable && c.eligible && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1"><span className="label">Type the refund amount to approve (₹)</span><input className="field" inputMode="decimal" placeholder={String(c.decision.refundPaise / 100)} value={confirmAmt} onChange={(e) => setConfirmAmt(e.target.value)} /></label>
          <button className="btn-primary" disabled={busy || !confirmAmt || !c.paymentId} onClick={approve}>{busy ? 'Refunding…' : 'Approve and refund'}</button>
        </div>
      )}
      {actionable && !c.paymentId && <p className="mt-2 text-xs text-warn">Add the Razorpay payment id (open a new case with it) before approving.</p>}
      {actionable && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1"><span className="label">Reject with a note</span><input className="field" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="btn-secondary" disabled={busy || note.trim().length < 3} onClick={reject}>Reject</button>
        </div>
      )}
      <div className="mt-3"><ErrorNote error={error} /></div>
    </Card>
  );
}
