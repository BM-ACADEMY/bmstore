import http from 'node:http';
import https from 'node:https';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Tenant resolution for every page: the shopper's Host (custom domain in production, <slug>.localhost in dev) is
 * asked of the API once per minute per host. Unknown hosts and SUSPENDED / PARKED stores are rewritten to a friendly
 * page; BUILDING stores are served as previews with `X-Robots-Tag: noindex` (the layout adds the meta tag + ribbon).
 * Runs on the Node.js runtime so the real Host header can be sent upstream (undici's fetch drops it).
 */
export const config = { runtime: 'nodejs', matcher: ['/((?!_next/|fonts/|favicon\\.ico|icon\\.svg|api/|robots\\.txt|sitemap\\.xml).*)'] };

const API_URL = (process.env.API_URL ?? process.env.API_INTERNAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TTL_MS = 30_000;
type Status = { kind: 'ok'; name: string; slug: string; status: string } | { kind: 'unknown' } | { kind: 'blocked'; message: string } | { kind: 'down' };
const cache = new Map<string, { at: number; value: Status }>();

function lookup(host: string): Promise<Status> {
  const url = new URL(`${API_URL}/storefront/status`);
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const r = client.request(url, { method: 'GET', headers: { host, accept: 'application/json' }, timeout: 3000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body: any = null;
        try { body = JSON.parse(text); } catch { /* not json */ }
        if (res.statusCode === 200 && body?.slug) return resolve({ kind: 'ok', name: body.name, slug: body.slug, status: body.status });
        if (res.statusCode === 404) return resolve({ kind: 'unknown' });
        if (res.statusCode === 403) return resolve({ kind: 'blocked', message: String(body?.message ?? 'Store unavailable') });
        resolve({ kind: 'down' });
      });
    });
    r.on('timeout', () => { r.destroy(); resolve({ kind: 'down' }); });
    r.on('error', () => resolve({ kind: 'down' }));
    r.end();
  });
}

async function statusFor(host: string): Promise<Status> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const v = await lookup(host);
  if (v.kind !== 'down') cache.set(host, { at: Date.now(), value: v });
  return v;
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost').split(',')[0].trim().toLowerCase();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/unavailable')) return NextResponse.next();
  const s = await statusFor(host);
  if (s.kind !== 'ok') {
    const url = req.nextUrl.clone();
    url.pathname = '/unavailable';
    url.search = `?reason=${s.kind === 'blocked' ? encodeURIComponent(s.message) : s.kind}`;
    const res = NextResponse.rewrite(url, { status: s.kind === 'unknown' ? 404 : s.kind === 'blocked' ? 403 : 503 });
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-store-host', host);
  reqHeaders.set('x-store-status', s.status);
  reqHeaders.set('x-store-path', pathname);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  if (s.status === 'BUILDING') res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
