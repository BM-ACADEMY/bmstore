import { NextRequest, NextResponse } from 'next/server';
import { apiRequest } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy for the browser: /api/storefront/* -> API /storefront/* with the shopper's Host forwarded
 * (so the API resolves the same store) and the client IP for rate limits. Only the public storefront surface is
 * reachable through here. In production Caddy routes /api/* straight to the API; this exists for dev and as a fallback.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path[0] !== 'storefront') return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const target = `/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const rawBody = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());
  const headers: Record<string, string> = {};
  for (const h of ['content-type', 'accept', 'x-razorpay-signature', 'x-razorpay-event-id']) { const v = req.headers.get(h); if (v) headers[h] = v; }
  const xff = req.headers.get('x-forwarded-for');
  if (xff) headers['x-forwarded-for'] = xff;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost';
  const upstream = await apiRequest(target, { method: req.method, headers, rawBody, host });
  const res = new NextResponse(upstream.status === 204 ? null : new Uint8Array(upstream.body), { status: upstream.status });
  for (const h of ['content-type', 'content-disposition', 'retry-after', 'x-request-id', 'cache-control']) { const v = upstream.headers[h]; if (v) res.headers.set(h, Array.isArray(v) ? v.join(', ') : v); }
  return res;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
