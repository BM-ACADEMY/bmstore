import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Served at https://<store host>/admin so the admin knows its store from the Host (see lib/base-path.ts).
  basePath: '/admin',
  reactStrictMode: true,
  poweredByHeader: false,
  // Images come from the store's own bucket/CDN (any host); plain <img> is used, so no remotePatterns needed.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'X-Frame-Options', value: 'DENY' }] }];
  },
};

export default nextConfig;
