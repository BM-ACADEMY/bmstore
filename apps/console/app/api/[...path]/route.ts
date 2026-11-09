import { NextRequest, NextResponse } from 'next/server';
import { ACCESS, apiFetch, clearSession, refreshTokens, setSession } from '@/lib/server/proxy';

export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy: /api/<path> -> API /superadmin/console/<path>. Only console routes are reachable through it.
 * Token from the httpOnly cookie; one refresh on 401. Bodies (JSON, CSV/XLSX bytes) pass through untouched.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.some((p) => p === '..' || p === '.' || p.includes('/'))) return NextResponse.json({ message: 'Bad path' }, { status: 400 });
  const target = `/superadmin/console/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());
  const headers: Record<string, string> = {};
  for (const h of ['content-type', 'accept']) { const v = req.headers.get(h); if (v) headers[h] = v; }

  let token = req.cookies.get(ACCESS)?.value ?? null;
  let upstream = await apiFetch(req, target, { method: req.method, headers, body, token });
  let fresh: { accessToken: string; refreshToken: string } | null = null;
  if (upstream.status === 401) {
    fresh = await refreshTokens(req);
    if (fresh) { token = fresh.accessToken; upstream = await apiFetch(req, target, { method: req.method, headers, body, token }); }
  }
  const res = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status });
  for (const h of ['content-type', 'content-disposition', 'retry-after']) { const v = upstream.headers.get(h); if (v) res.headers.set(h, v); }
  if (fresh) setSession(res, req, fresh);
  else if (upstream.status === 401) clearSession(res);
  return res;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
