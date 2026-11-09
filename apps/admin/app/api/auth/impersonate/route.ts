import { NextRequest, NextResponse } from 'next/server';
import { ACCESS, REFRESH, apiFetch } from '@/lib/server/proxy';

export const dynamic = 'force-dynamic';

/**
 * Developer impersonation landing (opened from the developer console). Redeems the one-time code on THIS store's
 * host and sets a 15-minute owner session: access cookie only, no refresh token, host-only cookies (no Domain).
 * The API audits both the start (with the developer's reason) and the redemption.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') ?? '';
  const r = await apiFetch(req, '/auth/impersonate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await r.json().catch(() => ({}));
  const home = new URL('/', req.url);
  if (!r.ok || !data.accessToken) {
    const login = new URL('/login', req.url);
    login.searchParams.set('error', String(data?.message ?? 'Impersonation link expired'));
    return NextResponse.redirect(login);
  }
  const res = NextResponse.redirect(home);
  const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  res.cookies.set(ACCESS, data.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 15 * 60 });
  res.cookies.set(REFRESH, '', { path: '/', maxAge: 0 });
  return res;
}
