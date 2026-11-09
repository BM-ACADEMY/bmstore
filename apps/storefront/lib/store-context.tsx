'use client';
import { createContext, ReactNode, useCallback, useContext } from 'react';
import type { Lang } from './i18n';
export { pickLang } from './i18n';
import { cardStyleOf, layoutOf, type LayoutId, type ThemeRow } from './theme';

export interface StoreInfo { name: string; slug: string; status: string; address: string | null; gstNumber: string | null; supportPhone: string | null; whatsappNumber: string | null }
export interface PublicSettings { shippingMode: 'FLAT' | 'FREE' | 'FREE_ABOVE'; flatRate: number; freeAbove: number | null; codEnabled: boolean; codCharge: number; cities: Array<{ city: string; ratePaise: number }>; lowStockThreshold: number }
export interface StoreCtx { store: StoreInfo; settings: PublicSettings; payments: { cod: boolean; online: boolean }; lang: Lang; messages: Record<string, string>; host: string; theme: ThemeRow; previewing: boolean }

const Ctx = createContext<StoreCtx | null>(null);
export function StoreProvider({ value, children }: { value: StoreCtx; children: ReactNode }) { return <Ctx.Provider value={value}>{children}</Ctx.Provider>; }
export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
/** The active layout / card style for this request (theme row, with any browser preview already merged). */
export function useLayout(): { layout: LayoutId; cardStyle: ReturnType<typeof cardStyleOf>; theme: ThemeRow } {
  const { theme } = useStore();
  return { layout: layoutOf(theme), cardStyle: cardStyleOf(theme), theme };
}
/** Client-side translation with the dictionary the server picked for this request. */
export function useT() {
  const { messages } = useStore();
  return useCallback((key: string, vars?: Record<string, string | number>) => {
    let s = messages[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }, [messages]);
}
