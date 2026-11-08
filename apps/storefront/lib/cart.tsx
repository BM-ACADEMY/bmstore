'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useStore } from './store-context';

/** A cart line: ids for the server (which re-prices everything), plus a display snapshot for the cart page. */
export interface CartLine { productId: string; variantId: string | null; qty: number; name: string; slug: string; image: string | null; unitPrice: number; variantLabel: string | null; maxQty: number }
interface CartCtx { lines: CartLine[]; count: number; subtotal: number; add: (l: Omit<CartLine, 'qty'>, qty?: number) => void; setQty: (productId: string, variantId: string | null, qty: number) => void; remove: (productId: string, variantId: string | null) => void; clear: () => void; ready: boolean }

const Ctx = createContext<CartCtx | null>(null);
const key = (slug: string) => `bm_cart:${slug}`;
const same = (a: { productId: string; variantId: string | null }, b: { productId: string; variantId: string | null }) => a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { store } = useStore();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(key(store.slug)); if (raw) setLines(JSON.parse(raw)); } catch { /* ignore */ }
    setReady(true);
  }, [store.slug]);
  useEffect(() => { if (ready) try { localStorage.setItem(key(store.slug), JSON.stringify(lines)); } catch { /* ignore */ } }, [lines, ready, store.slug]);

  const add = useCallback((l: Omit<CartLine, 'qty'>, qty = 1) => setLines((cur) => {
    const i = cur.findIndex((x) => same(x, l));
    if (i === -1) return [...cur, { ...l, qty: Math.min(qty, l.maxQty || 99) }];
    const next = [...cur];
    next[i] = { ...next[i], ...l, qty: Math.min(next[i].qty + qty, l.maxQty || 99) };
    return next;
  }), []);
  const setQty = useCallback((productId: string, variantId: string | null, qty: number) => setLines((cur) => (qty <= 0 ? cur.filter((x) => !same(x, { productId, variantId })) : cur.map((x) => (same(x, { productId, variantId }) ? { ...x, qty: Math.min(qty, x.maxQty || 99) } : x)))), []);
  const remove = useCallback((productId: string, variantId: string | null) => setLines((cur) => cur.filter((x) => !same(x, { productId, variantId }))), []);
  const clear = useCallback(() => setLines([]), []);
  const value = useMemo<CartCtx>(() => ({ lines, ready, count: lines.reduce((n, l) => n + l.qty, 0), subtotal: lines.reduce((n, l) => n + l.qty * l.unitPrice, 0), add, setQty, remove, clear }), [lines, ready, add, setQty, remove, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useCart(): CartCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart outside CartProvider');
  return v;
}
