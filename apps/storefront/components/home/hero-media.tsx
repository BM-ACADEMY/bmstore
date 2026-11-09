'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export interface HeroData { type: string; bannerUrls: string[]; videoUrl: string | null; tagline: string | null; taglineTa: string | null; ctaLabel: string | null; ctaLabelTa: string | null; ctaHref: string | null }

/**
 * The hero's picture layer in the three theme hero types: a single banner, an auto-advancing slider over the
 * uploaded banners (pauses on hover / focus, dots are real buttons), or a muted looping video with banners[0] as
 * the poster. Layout components draw the text on top; this only paints the media.
 */
export function HeroMedia({ hero, sizes = '(min-width: 1152px) 1152px, 100vw', className = '', overlay }: { hero: HeroData; sizes?: string; className?: string; overlay?: React.ReactNode }) {
  const urls = hero.bannerUrls;
  const slider = hero.type === 'slider' && urls.length > 1;
  const video = hero.type === 'video' && hero.videoUrl;
  const [i, setI] = useState(0);
  const paused = useRef(false);
  useEffect(() => {
    if (!slider) return;
    const id = setInterval(() => { if (!paused.current) setI((n) => (n + 1) % urls.length); }, 4500);
    return () => clearInterval(id);
  }, [slider, urls.length]);
  return (
    <div className={`absolute inset-0 ${className}`} onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }} onFocus={() => { paused.current = true; }} onBlur={() => { paused.current = false; }}>
      {video ? (
        <video className="absolute inset-0 h-full w-full object-cover" src={hero.videoUrl!} poster={urls[0]} autoPlay muted loop playsInline preload="metadata" aria-hidden />
      ) : slider ? (
        <>
          {urls.map((u, n) => (
            <Image key={u} src={u} alt="" fill priority={n === 0} fetchPriority={n === 0 ? 'high' : undefined} sizes={sizes} className={`object-cover transition-opacity duration-700 ${n === i ? 'opacity-100' : 'opacity-0'}`} aria-hidden={n !== i} />
          ))}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10" role="tablist" aria-label="Banners">
            {urls.map((u, n) => <button key={u} type="button" role="tab" aria-selected={n === i} aria-label={`${n + 1}`} onClick={() => setI(n)} className="h-11 w-11 grid place-items-center"><span className={`block h-1.5 rounded-pill transition-all ${n === i ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`} /></button>)}
          </div>
        </>
      ) : urls[0] ? (
        <Image src={urls[0]} alt="" fill priority fetchPriority="high" sizes={sizes} className="object-cover" />
      ) : null}
      {overlay}
    </div>
  );
}
