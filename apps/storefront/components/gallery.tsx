'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { Placeholder } from './product-image';

/** Swipeable gallery (scroll-snap) with thumbnails. First image is the LCP candidate and loads eagerly. */
export function Gallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  if (!images.length) return <div className="relative aspect-saree rounded-card-lg overflow-hidden"><Placeholder label={name} /></div>;
  const go = (n: number) => { setI(n); ref.current?.children[n]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' }); };
  return (
    <div>
      <div ref={ref} className="flex snap-x snap-mandatory overflow-x-auto rounded-card-lg [scrollbar-width:none] scroll-x !gap-0 !pb-0 !mx-0 !px-0" onScroll={(e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / el.clientWidth); if (n !== i) setI(n); }} aria-roledescription="carousel">
        {images.map((src, n) => (
          <div key={src} className="relative aspect-saree w-full shrink-0 snap-start bg-primary-soft" aria-roledescription="slide" aria-label={`${n + 1} / ${images.length}`}>
            <Image src={src} alt={`${name} ${n + 1}`} fill priority={n === 0} loading={n === 0 ? 'eager' : 'lazy'} sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {images.map((src, n) => (
            <button key={src} type="button" onClick={() => go(n)} className={`relative h-16 w-14 shrink-0 overflow-hidden rounded-card border-2 ${n === i ? 'border-primary' : 'border-transparent'}`} aria-label={`${n + 1}`} aria-current={n === i}>
              <Image src={src} alt="" fill sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
