import { NextRequest } from 'next/server';
import { apiRequest, safeJson } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

/** Per-tenant robots.txt: LIVE stores are crawlable (except cart/checkout/order pages); previews and unknown hosts are not. */
export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const status = await apiRequest('/storefront/status', { host });
  const live = status.status === 200 && (safeJson(status.body.toString()) as any)?.status === 'LIVE';
  const body = live
    ? `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order/\nDisallow: /track\nDisallow: /search\nDisallow: /api/\n\nSitemap: ${proto}://${host}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ...(live ? {} : { 'X-Robots-Tag': 'noindex, nofollow' }) } });
}
