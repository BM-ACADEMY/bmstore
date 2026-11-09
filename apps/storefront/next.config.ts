import type { NextConfig } from 'next';

const platformDomain = process.env.PLATFORM_BASE_DOMAIN ?? 'store.bmtechx.in';
// The owner's theme editor embeds the store for live preview: allow framing by this host and the platform admin only.
const frameAncestors = `frame-ancestors 'self' https://admin.${platformDomain} http://admin.${platformDomain}${platformDomain === 'localhost' ? ' http://*.localhost:*' : ''}`;
const imageHosts = (process.env.IMAGE_HOSTS ?? 'localhost,127.0.0.1').split(',').map((h) => h.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Inline the (small) stylesheet into the HTML: one fewer render-blocking round trip on 4G.
  experimental: { inlineCss: true },
  images: {
    // Product photos live in the store's bucket/CDN; next/image serves WebP/AVIF variants sized for the viewport.
    remotePatterns: imageHosts.flatMap((hostname) => [{ protocol: 'https' as const, hostname }, { protocol: 'http' as const, hostname }]),
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [390, 430, 640, 768, 1024, 1280, 1536],
    imageSizes: [48, 96, 160, 200, 320],
    minimumCacheTTL: 60 * 60 * 24,
  },
  async headers() {
    return [
      { source: '/fonts/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }, { key: 'Access-Control-Allow-Origin', value: '*' }] }, // the owner's theme editor renders font samples with these files
      { source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'Content-Security-Policy', value: frameAncestors }] },
    ];
  },
};

export default nextConfig;
