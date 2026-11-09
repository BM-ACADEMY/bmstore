'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { rupees } from '@/lib/money';
import { payWithRazorpay } from '@/lib/razorpay';
import { useStore, useT } from '@/lib/store-context';
import { whatsappLink } from '@/lib/wa';
import { CheckIcon, WhatsAppIcon } from './icons';
import { Placeholder } from './product-image';

export interface OrderData {
  orderNo: string; createdAt: string; orderStatus: string; paymentMode: 'COD' | 'ONLINE'; paymentStatus: string; paidAt: string | null;
  items: Array<{ productId: string | null; variantId: string | null; name: string; qty: number; unitPrice: number; total: number; image: string | null; variantLabel?: string | null }>;
  subtotal: number; discount: number; couponCode: string | null; shipping: number; codCharge: number; tax: number; total: number;
  customer: { name: string; phone: string }; address: { line1?: string; line2?: string | null; city?: string; state?: string; pincode?: string };
  token: string; invoiceUrl: string; expiresAt: string | null; razorpay: any | null;
}
const STEPS = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'];

export function OrderView({ order, justPlaced, retry }: { order: OrderData; justPlaced: boolean; retry: boolean }) {
  const t = useT();
  const { store } = useStore();
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(retry ? t('checkout.payFailed') : null);
  const unpaidOnline = order.paymentMode === 'ONLINE' && order.paymentStatus !== 'PAID';
  const stepIdx = STEPS.indexOf(order.orderStatus);
  const wa = whatsappLink(store.whatsappNumber, `Hello! About my order ${order.orderNo}`);
  const pay = async () => {
    if (!order.razorpay) return;
    setPaying(true); setPayError(null);
    try {
      const r = await payWithRazorpay(order.razorpay, getComputedStyle(document.documentElement).getPropertyValue('--sf-primary').trim() || '#7A1F2B');
      await api('/payments/razorpay/verify', { method: 'POST', json: { orderNo: order.orderNo, ...r } });
      router.replace(`/order/${encodeURIComponent(order.orderNo)}?t=${order.token}`);
      router.refresh();
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : t('checkout.payFailed'));
    } finally { setPaying(false); }
  };
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        {justPlaced && !unpaidOnline && (
          <div className="card p-6 text-center mb-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-ok-soft text-ok grid place-items-center"><CheckIcon className="h-8 w-8" /></div>
            <h2 className="font-heading text-2xl mt-3">{t('order.thanks', { name: order.customer.name.split(' ')[0] })}</h2>
            <p className="text-ink-2 mt-1">{t('order.number')}: <span className="font-semibold text-ink">{order.orderNo}</span></p>
            {order.paymentMode === 'COD' && <p className="text-sm text-ink-2 mt-2">{t('order.cod', { amount: rupees(order.total) })}</p>}
          </div>
        )}
        {unpaidOnline && (
          <div className="card p-6 mb-6 border-primary/40">
            <h2 className="font-heading text-xl">{t('order.paymentPending')}</h2>
            <p className="text-sm text-ink-2 mt-1">{t('order.number')}: <span className="font-semibold text-ink">{order.orderNo}</span></p>
            {payError && <p className="mt-2 text-sm text-bad">{payError}</p>}
            {order.razorpay ? <button type="button" className="btn-primary mt-4 w-full sm:w-auto" disabled={paying} onClick={pay}>{t('order.retryPayment')} · {rupees(order.total)}</button> : <p className="mt-2 text-sm text-ink-3">{t('status.CANCELLED')}</p>}
          </div>
        )}

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg">{t('order.status')}</h2>
            <span className="text-sm font-semibold text-primary-text">{t(`status.${order.orderStatus}`)}</span>
          </div>
          {stepIdx >= 0 ? (
            <ol className="mt-4 grid grid-cols-5 gap-1 text-[11px] text-center">
              {STEPS.map((s, i) => (
                <li key={s} className={`flex flex-col items-center gap-1.5 ${i <= stepIdx ? 'text-primary-text' : 'text-ink-3'}`}>
                  <span className={`h-3 w-3 rounded-full ${i <= stepIdx ? 'bg-primary' : 'bg-line'}`} aria-hidden /><span>{t(`status.${s}`)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-sm text-ink-2">{t(`status.${order.orderStatus}`)}</p>}
          <p className="mt-4 text-sm text-ink-2">{t(`payment.${order.paymentStatus}`)} · {order.paymentMode === 'COD' ? t('checkout.cod') : t('checkout.online')}</p>
        </section>

        <section className="card p-5 mt-4">
          <h2 className="font-heading text-lg mb-2">{t('order.items')}</h2>
          <ul className="divide-y divide-line">
            {order.items.map((i, n) => (
              <li key={n} className="flex gap-3 py-3">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-card bg-primary-soft">{i.image ? <Image src={i.image} alt="" fill sizes="64px" className="object-cover" /> : <Placeholder label={i.name} />}</div>
                <div className="flex-1 min-w-0"><div className="font-medium leading-snug">{i.name}</div>{i.variantLabel && <div className="text-sm text-ink-3">{i.variantLabel}</div>}<div className="text-sm text-ink-2">× {i.qty}</div></div>
                <div className="font-semibold">{rupees(i.total)}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 mt-4">
          <h2 className="font-heading text-lg mb-2">{t('order.deliverTo')}</h2>
          <p className="text-sm text-ink-2">{order.customer.name} · {order.customer.phone}<br />{[order.address.line1, order.address.line2, order.address.city, order.address.state, order.address.pincode].filter(Boolean).join(', ')}</p>
        </section>
      </div>

      <aside className="h-fit lg:sticky lg:top-24">
        <div className="card p-5">
          <h2 className="font-heading text-lg mb-3">{t('checkout.summary')}</h2>
          <Row l={t('checkout.subtotal')} v={rupees(order.subtotal)} />
          {order.discount > 0 && <Row l={`${t('checkout.discount')}${order.couponCode ? ` (${order.couponCode})` : ''}`} v={`−${rupees(order.discount)}`} />}
          <Row l={t('checkout.shipping')} v={order.shipping ? rupees(order.shipping) : t('checkout.free')} />
          {order.codCharge > 0 && <Row l={t('checkout.codFee')} v={rupees(order.codCharge)} />}
          <div className="flex justify-between text-lg font-semibold mt-2 border-t border-line pt-3"><span>{t('checkout.total')}</span><span>{rupees(order.total)}</span></div>
          {order.tax > 0 && <p className="text-xs text-ink-3 mt-1">{t('checkout.tax')} {rupees(order.tax)}</p>}
          <a href={order.invoiceUrl} className="btn-outline mt-5 w-full" download>{store.gstNumber ? t('order.gstInvoice') : t('order.invoice')}</a>
          <Link href={`/order/${encodeURIComponent(order.orderNo)}?t=${order.token}`} className="btn-ghost mt-2 w-full">{t('order.trackCta')}</Link>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-wa mt-2 w-full"><WhatsAppIcon className="h-5 w-5" />{t('order.whatsapp')}</a>}
          <Link href="/c/all" className="btn-ghost mt-2 w-full">{t('cart.continue')}</Link>
        </div>
      </aside>
    </div>
  );
}
const Row = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between py-1 text-sm text-ink-2"><span>{l}</span><span className="text-ink">{v}</span></div>;
