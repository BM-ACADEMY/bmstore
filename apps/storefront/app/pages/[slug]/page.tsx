import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StoreApiError, storeGet } from '@/lib/server/api';
import { getBootstrap } from '@/lib/server/store';

type Params = { slug: string };
interface Page { slug: string; title: string; content: string; isPolicy: boolean }
async function load(slug: string): Promise<Page> {
  try { return await storeGet<Page>(`/storefront/pages/${encodeURIComponent(slug)}`); }
  catch (e) { if (e instanceof StoreApiError && e.status === 404) notFound(); throw e; }
}
/** Pages are written by the store owner in the admin (plain text or simple HTML). Scripts and event handlers are stripped. */
function sanitize(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*/gi, '$1=$2#');
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const [p, boot] = await Promise.all([load(slug), getBootstrap()]);
  return { title: p.title, description: `${p.title} · ${boot.store.name}` };
}

export default async function ContentPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const p = await load(slug);
  const looksHtml = /<[a-z][\s\S]*>/i.test(p.content);
  return (
    <article className="container-x pt-8 pb-12 max-w-3xl">
      <h1 className="font-heading text-3xl sm:text-4xl">{p.title}</h1>
      <div className="zari-thin w-20 mt-4 mb-8" aria-hidden />
      {looksHtml
        ? <div className="page-content text-ink-2 leading-relaxed [&_h2]:font-heading [&_h2]:text-ink [&_h2]:text-xl [&_h2]:mt-8 [&_h2]:mb-2 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-primary-text [&_a]:underline" dangerouslySetInnerHTML={{ __html: sanitize(p.content) }} />
        : <div className="text-ink-2 leading-relaxed whitespace-pre-line">{p.content || '—'}</div>}
    </article>
  );
}
