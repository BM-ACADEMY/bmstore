import { NextRequest } from 'next/server';
import { apiRequest, safeJson } from '@/lib/server/api';

export const dynamic = 'force-dynamic';

interface Sitemap { products: Array<{ slug: string; updatedAt: string }>; categories: string[]; pages: string[] }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Per-tenant sitemap: built from this store's catalogue only. Preview (BUILDING) stores answer 404 so nothing gets indexed. */
export async function GET(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;
  const status = await apiRequest('/storefront/status', { host });
  if (status.status !== 200) return new Response('Not found', { status: 404 });
  if ((safeJson(status.body.toString()) as any)?.status === 'BUILDING') return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
  const r = await apiRequest('/storefront/sitemap', { host });
  if (r.status !== 200) return new Response('Unavailable', { status: 503 });
  const data = safeJson(r.body.toString()) as Sitemap;
  const url = (path: string, extra = '') => `<url><loc>${esc(base + path)}</loc>${extra}</url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    url('/', '<changefreq>daily</changefreq><priority>1.0</priority>'),
    url('/c/all', '<changefreq>daily</changefreq>'),
    ...data.categories.map((s) => url(`/c/${encodeURIComponent(s)}`, '<changefreq>daily</changefreq>')),
    ...data.products.map((p) => url(`/p/${encodeURIComponent(p.slug)}`, `<lastmod>${p.updatedAt.slice(0, 10)}</lastmod><changefreq>weekly</changefreq>`)),
    ...data.pages.map((s) => url(`/pages/${encodeURIComponent(s)}`, '<changefreq>monthly</changefreq>')),
    url('/track', '<changefreq>yearly</changefreq><priority>0.2</priority>'),
  ].join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
