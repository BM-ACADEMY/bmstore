'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { useT } from '@/lib/store-context';

/** Order number + the phone used at checkout. The lookup is rate-limited server-side; the token in the reply opens the order page. */
export function TrackForm({ notFound }: { notFound: boolean }) {
  const t = useT();
  const router = useRouter();
  const [orderNo, setOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notFound ? t('track.notFound') : null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const o = await api<{ token: string; orderNo: string }>(`/orders/lookup?orderNo=${encodeURIComponent(orderNo.trim())}&phone=${encodeURIComponent(phone)}`, {}, t('track.notFound'));
      router.push(`/order/${encodeURIComponent(o.orderNo)}?t=${o.token}&phone=1`);
    } catch (err) { setError(err instanceof ApiError && err.status === 404 ? t('track.notFound') : err instanceof ApiError ? err.message : t('error.generic')); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card p-5 flex flex-col gap-4">
      <label className="block"><span className="label">{t('track.orderNo')}</span><input className="field uppercase" value={orderNo} onChange={(e) => setOrderNo(e.target.value.toUpperCase())} placeholder="SLS-1041" required /></label>
      <label className="block"><span className="label">{t('track.phone')}</span><input className="field" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" required /></label>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{t('track.find')}</button>
    </form>
  );
}
