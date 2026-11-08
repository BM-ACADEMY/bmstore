import Image from 'next/image';

/**
 * Product photo with a themed woven-texture placeholder when the store has not uploaded one yet. Uses next/image for
 * WebP/AVIF variants sized to the slot; `priority` only for above-the-fold images (LCP).
 */
export function ProductImage({ src, alt, sizes, priority = false, className = '', fill = true, width, height }: { src: string | null | undefined; alt: string; sizes: string; priority?: boolean; className?: string; fill?: boolean; width?: number; height?: number }) {
  if (!src) return <Placeholder label={alt} className={className} />;
  return fill
    ? <Image src={src} alt={alt} fill sizes={sizes} priority={priority} fetchPriority={priority ? 'high' : undefined} loading={priority ? 'eager' : 'lazy'} className={`object-cover ${className}`} />
    : <Image src={src} alt={alt} width={width ?? 800} height={height ?? 1000} sizes={sizes} priority={priority} fetchPriority={priority ? 'high' : undefined} loading={priority ? 'eager' : 'lazy'} className={`object-cover ${className}`} />;
}

export function Placeholder({ label, className = '' }: { label: string; className?: string }) {
  const initial = (label.trim()[0] ?? '·').toUpperCase();
  return (
    <div className={`absolute inset-0 bg-primary-soft text-primary-text ${className}`} aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 250" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="transparent" />
            <path d="M0 4h8" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="200" height="250" fill="url(#weave)" />
        <g fill="var(--sf-accent)" fillOpacity="0.9">
          {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${10 + i * 22} 222l6 6-6 6-6-6z`} />)}
          <rect x="0" y="238" width="200" height="2" />
          <rect x="0" y="214" width="200" height="1.5" />
        </g>
        <text x="100" y="135" textAnchor="middle" fontFamily="var(--sf-font-heading)" fontSize="72" fill="currentColor" fillOpacity="0.35">{initial}</text>
      </svg>
    </div>
  );
}
