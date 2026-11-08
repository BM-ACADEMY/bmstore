'use client';

export interface RzpInit { keyId: string; orderId: string; amount: number; currency: string; name: string; prefill: { name: string; contact: string; email?: string }; notes: Record<string, string> }
export interface RzpResult { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }

declare global { interface Window { Razorpay?: any } }

let loading: Promise<void> | null = null;
/** Loads Checkout.js once (only when a shopper actually chooses to pay online: it is not on the critical path). */
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error('Could not load the payment window. Check your connection and try again.')); };
    document.body.appendChild(s);
  });
  return loading;
}

/**
 * Opens Razorpay Checkout with UPI first (GPay / PhonePe / Paytm intent on phones), then cards and netbanking.
 * Resolves with the signed result (verified server-side afterwards) or rejects when the shopper closes the window.
 */
export async function payWithRazorpay(init: RzpInit, themeColor: string): Promise<RzpResult> {
  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: init.keyId, order_id: init.orderId, amount: init.amount, currency: init.currency, name: init.name, description: `Order ${init.notes.order_no}`,
      prefill: init.prefill, notes: init.notes, theme: { color: themeColor }, retry: { enabled: true, max_count: 3 },
      config: {
        display: {
          blocks: {
            upi: { name: 'Pay with UPI', instruments: [{ method: 'upi', flows: ['intent', 'collect', 'qr'] }] },
            other: { name: 'Cards, netbanking, wallets', instruments: [{ method: 'card' }, { method: 'netbanking' }, { method: 'wallet' }] },
          },
          sequence: ['block.upi', 'block.other'],
          preferences: { show_default_blocks: true },
        },
      },
      handler: (r: RzpResult) => resolve(r),
      modal: { ondismiss: () => reject(new Error('dismissed')), confirm_close: true },
    });
    rzp.on('payment.failed', () => { /* the shopper may retry inside the window; dismiss rejects */ });
    rzp.open();
  });
}
