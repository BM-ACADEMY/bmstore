import { NextRequest, NextResponse } from 'next/server';
import { apiFetch, setSession } from '@/lib/server/proxy';

export const dynamic = 'force-dynamic';

/** Superadmin login on the platform host; tokens go into httpOnly, host-only cookies. */
export async function POST(req: NextRequest) {
  const r = await apiFetch(req, '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: await req.text() });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const res = NextResponse.json(data, { status: r.status });
    const ra = r.headers.get('retry-after');
    if (ra) res.headers.set('retry-after', ra);
    return res;
  }
  const res = NextResponse.json({ ok: true });
  setSession(res, req, data);
  return res;
}
