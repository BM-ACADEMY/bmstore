import 'server-only';
import http from 'node:http';
import https from 'node:https';
import { headers } from 'next/headers';

export const API_URL = (process.env.API_URL ?? process.env.API_INTERNAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class StoreApiError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) { super(message); }
}

/** The shopper's Host (the store's own domain, or <slug>.<platform domain>). Port is irrelevant to the API. */
export async function storeHost(): Promise<string> {
  const h = await headers();
  return h.get('x-store-host') ?? h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost';
}

interface Opts { method?: string; body?: unknown; headers?: Record<string, string>; host?: string; rawBody?: Buffer }

/**
 * Call the API as the shopper's store. Node's fetch (undici) drops a custom Host header, so this uses http.request
 * and sends the store Host; the API resolves the tenant exactly as if the browser had called it.
 */
export async function apiRequest(path: string, opts: Opts = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const host = opts.host ?? (await storeHost());
  const url = new URL(`${API_URL}${path}`);
  const headers: Record<string, string> = { accept: 'application/json', ...(opts.headers ?? {}), host };
  let payload: Buffer | undefined = opts.rawBody;
  if (payload === undefined && opts.body !== undefined) { payload = Buffer.from(JSON.stringify(opts.body)); headers['content-type'] = 'application/json'; }
  if (payload) headers['content-length'] = String(payload.length);
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const r = client.request(url, { method: opts.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 502, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = Number(process.env.STOREFRONT_CACHE_SECONDS ?? 60) * 1000;

/**
 * GET as JSON with a short per-host cache (ISR-equivalent for a multi-tenant app: the full-route cache cannot be
 * used because every store shares the same paths, so pages render on the server and data is cached per Host).
 */
export async function storeGet<T>(path: string, opts: { ttlMs?: number; host?: string } = {}): Promise<T> {
  const host = opts.host ?? (await storeHost());
  const key = `${host} ${path}`;
  const ttl = opts.ttlMs ?? TTL_MS;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  const r = await apiRequest(path, { host });
  const data = r.body.length ? safeJson(r.body.toString('utf8')) : null;
  if (r.status >= 400) throw new StoreApiError(r.status, messageOf(data) ?? `API ${r.status}`, data);
  if (ttl > 0) {
    cache.set(key, { at: Date.now(), value: data });
    if (cache.size > 5000) for (const k of [...cache.keys()].slice(0, 1000)) cache.delete(k);
  }
  return data as T;
}

export function safeJson(t: string): unknown { try { return JSON.parse(t); } catch { return t; } }
export function messageOf(body: unknown): string | null {
  const m = (body as any)?.message;
  if (Array.isArray(m)) return m.join('. ');
  return typeof m === 'string' ? m : null;
}
