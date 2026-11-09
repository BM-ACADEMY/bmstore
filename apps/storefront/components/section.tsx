import Link from 'next/link';

export function SectionHeading({ eyebrow, title, href, hrefLabel, center = false }: { eyebrow?: string; title: string; href?: string; hrefLabel?: string; center?: boolean }) {
  return (
    <div className={`mb-5 flex items-end justify-between gap-4 ${center ? 'flex-col items-center text-center' : ''}`}>
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h2 className="font-heading text-2xl sm:text-3xl text-ink">{title}</h2>
      </div>
      {href && <Link href={href} className="inline-flex items-center min-h-11 -my-3 px-1 -mr-1 text-sm font-semibold text-primary-text underline-offset-4 hover:underline whitespace-nowrap">{hrefLabel}</Link>}
    </div>
  );
}
