import 'server-only';
import { notFound } from 'next/navigation';
import type { CardProduct } from '@/components/product-card';
import { StoreApiError, storeGet } from './api';

export interface Listing {
  items: CardProduct[]; total: number; page: number; pageSize: number;
  category: { id: string; name: string; slug: string; parentId: string | null } | null;
  children: Array<{ id: string; name: string; slug: string }>;
  facets: { minPrice: number; maxPrice: number; options: Record<string, string[]> };
}
export type Search = Record<string, string | string[] | undefined>;
const ALLOWED = ['q', 'sort', 'minPrice', 'maxPrice', 'inStock', 'option', 'page'];

/** Only known filter keys travel to the API (the URL is user input). */
export function listingQuery(sp: Search, extra: Record<string, string> = {}) {
  const p = new URLSearchParams(extra);
  for (const k of ALLOWED) { const v = sp[k]; if (typeof v === 'string' && v) p.set(k, v); }
  return p;
}

export async function fetchListing(sp: Search, extra: Record<string, string> = {}): Promise<Listing> {
  try { return await storeGet<Listing>(`/storefront/products?${listingQuery(sp, extra)}`, { ttlMs: 30_000 }); }
  catch (e) { if (e instanceof StoreApiError && (e.status === 404 || e.status === 400)) notFound(); throw e; }
}
