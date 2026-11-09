import http from 'node:http';
import https from 'node:https';
import { NextRequest, NextResponse } from 'next/server';

export const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
/** The console always talks to the API as the PLATFORM host: superadmin logins exist only there. */
export const API_HOST = process.env.API_HOST ?? 'admin.localhost';
export const ACCESS = 'bmc_access';
export const REFRESH = 'bmc_refresh';

const secure = (req: NextRequest) => req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';

/** Host-only cookies (no Domain attribute, ever): they never reach store hosts or other sub-domains. */
export function setSession(res: NextResponse, req: NextRequest, t: { accessToken: string; refreshToken: string }) {
  const base = { httpOnly: true, sameSite: 'strict' as const, secure: secure(req), path: '/' };
  res.cookies.set(ACCESS, t.accessToken, { ...base, maxAge: 60 * 60 * 12 });
  res.cookies.set(REFRESH, t.refreshToken, { ...base, maxAge: 60 * 60 * 24 * 7 });
}
export function clearSession(res: NextResponse) {
  res.cookies.set(ACCESS, '', { path: '/', maxAge: 0 });
  res.cookies.set(REFRESH, '', { path: '/', maxAge: 0 });
}

/** Upstream call with the platform Host (Node's fetch cannot set Host, so http.request). */
export function apiFetch(req: NextRequest, path: string, init: { method?: string; headers?: Record<string, string>; body?: Buffer | string; token?: string | null } = {}): Promise<Response> {
  const url = new URL(`${API_URL}${path}`);
  const headers: Record<string, string> = { ...(init.headers ?? {}), host: API_HOST };
  const xff = req.headers.get('x-forwarded-for');
  if (xff) headers['x-forwarded-for'] = xff;
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const body = init.body === undefined ? undefined : Buffer.isBuffer(init.body) ? init.body : Buffer.from(init.body);
  if (body) headers['content-length'] = String(body.length);
  const client = url.protocol === 'https:' ? https : http;
  return new Promise<Response>((resolve, reject) => {
    const r = client.request(url, { method: init.method ?? 'GET', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(', ') : v);
        const status = res.statusCode ?? 502;
        resolve(new Response(status === 204 || status === 304 ? null : Buffer.concat(chunks), { status, headers: h }));
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

export async function refreshTokens(req: NextRequest): Promise<{ accessToken: string; refreshToken: string } | null> {
  const refresh = req.cookies.get(REFRESH)?.value;
  if (!refresh) return null;
  const r = await apiFetch(req, '/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
  return r.ok ? r.json() : null;
}
