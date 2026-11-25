import { NextRequest, NextResponse } from 'next/server';
import { BASE_PATH, withBase } from '@/lib/base-path';
import { ACCESS, REFRESH, apiFetch } from '@/lib/server/proxy';

export const dynamic = 'force-dynamic';

/**
 * Relative redirect. Route handlers see the app's own address (e.g. localhost:3000) in req.url and drop the
 * /admin base path, so an absolute URL built from it would send the browser to the wrong place.
 */
const redirectTo = (location: string) => new NextResponse(null, { status: 307, headers: { Location: location } });

/**
 * Developer impersonation landing (opened from the developer console). Redeems the one-time code on THIS store's
 * host and sets a 15-minute owner session: access cookie only, no refresh token, host-only cookies (no Domain).
 * The API audits both the start (with the developer's reason) and the redemption.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') ?? '';
  const r = await apiFetch(req, '/auth/impersonate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.accessToken) {
    return redirectTo(withBase(`/login?error=${encodeURIComponent(String(data?.message ?? 'Impersonation link expired'))}`));
  }
  const res = redirectTo(withBase('/'));
  const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  res.cookies.set(ACCESS, data.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: BASE_PATH, maxAge: 15 * 60 });
  res.cookies.set(REFRESH, '', { path: BASE_PATH, maxAge: 0 });
  return res;
}
