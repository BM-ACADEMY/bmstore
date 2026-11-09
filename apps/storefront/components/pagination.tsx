import Link from 'next/link';

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)} className="chip" rel="prev">‹</Link>}
      {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => Math.abs(n - page) <= 2 || n === 1 || n === pages).map((n, i, arr) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && arr[i - 1] !== n - 1 && <span className="text-ink-3">…</span>}
          <Link href={href(n)} className={n === page ? 'chip-on' : 'chip'} aria-current={n === page ? 'page' : undefined}>{n}</Link>
        </span>
      ))}
      {page < pages && <Link href={href(page + 1)} className="chip" rel="next">›</Link>}
    </nav>
  );
}
