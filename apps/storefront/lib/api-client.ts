'use client';

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly body?: unknown) { super(message); }
}
function messageOf(body: any, status: number, fallback: string): string {
  const m = body?.message;
  if (Array.isArray(m)) return m.join('. ');
  if (typeof m === 'string') return m;
  if (status === 429) return 'Too many attempts, please wait a minute';
  return fallback;
}
/** Browser -> /api/storefront/* (same origin). Errors carry the API's plain-language message. */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}, fallback = 'Something went wrong. Please try again'): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(init.json); }
  const r = await fetch(`/api/storefront${path}`, { ...init, headers, body, credentials: 'same-origin' });
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new ApiError(r.status, messageOf(data, r.status, fallback), data);
  return data as T;
}
