import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { PreviewRibbon } from '@/components/preview-ribbon';
import { UnavailableContent } from '@/components/unavailable';
import { CartProvider } from '@/lib/cart';
import { StoreApiError, storeHost } from '@/lib/server/api';
import { absoluteUrl, getBootstrap, getT } from '@/lib/server/store';
import { StoreProvider } from '@/lib/store-context';
import { themeVars } from '@/lib/theme';
import './globals.css';

// Self-hosted variable fonts (public/fonts): no third-party connection, preloaded, swap display.
const inter = localFont({ src: '../public/fonts/Inter.woff2', variable: '--font-inter', display: 'swap', weight: '100 900' });
const playfair = localFont({ src: '../public/fonts/PlayfairDisplay.woff2', variable: '--font-playfair', display: 'swap', weight: '400 900', preload: false }); // headings swap in; keeps the LCP image first on 4G
const tamil = localFont({ src: '../public/fonts/NotoSansTamil.woff2', variable: '--font-tamil', display: 'swap', weight: '100 900', preload: false });

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export async function generateMetadata(): Promise<Metadata> {
  const path = (await headers()).get('x-store-path') ?? '/';
  try {
    const boot = await getBootstrap();
    const preview = boot.store.status === 'BUILDING';
    return {
      metadataBase: new URL(await absoluteUrl('/')),
      title: { default: boot.store.name, template: `%s · ${boot.store.name}` },
      applicationName: boot.store.name,
      robots: preview ? { index: false, follow: false } : { index: true, follow: true },
      openGraph: { siteName: boot.store.name, type: 'website', locale: 'en_IN' },
      alternates: { canonical: path },
    };
  } catch {
    return { title: 'Store', robots: { index: false, follow: false } };
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, messages, t } = await getT();
  const host = await storeHost();
  const fontClass = `${inter.variable} ${playfair.variable} ${tamil.variable}`;
  let boot;
  try {
    boot = await getBootstrap();
  } catch (e) {
    // Unknown / blocked hosts are rewritten to /unavailable by the middleware (which renders as `children` here);
    // anything else reaching this branch is the API being down.
    const status = e instanceof StoreApiError ? e.status : 503;
    const onUnavailable = ((await headers()).get('x-store-path') ?? '') === '/unavailable' || (await headers()).get('x-middleware-rewrite')?.includes('/unavailable');
    const kind = status === 404 ? 'unknown' : status === 403 ? 'blocked' : 'down';
    return (
      <html lang={lang} className={fontClass} style={themeVars(null) as React.CSSProperties}>
        <head><meta name="robots" content="noindex, nofollow" /></head>
        <body>{onUnavailable ? children : <UnavailableContent kind={kind} />}</body>
      </html>
    );
  }
  const preview = boot.store.status === 'BUILDING';
  const vars = themeVars(boot.theme) as React.CSSProperties;
  const org = {
    '@context': 'https://schema.org', '@type': 'Organization', name: boot.store.name, url: await absoluteUrl('/'),
    ...(boot.theme?.logoUrl ? { logo: boot.theme.logoUrl } : {}), ...(boot.store.supportPhone ? { telephone: boot.store.supportPhone } : {}),
    ...(boot.store.address ? { address: { '@type': 'PostalAddress', streetAddress: boot.store.address, addressCountry: 'IN' } } : {}),
  };
  return (
    <html lang={lang} className={fontClass} style={vars}>
      <head>
        <meta name="theme-color" content={(vars as any)['--sf-bg']} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
      </head>
      <body>
        <StoreProvider value={{ store: boot.store, settings: boot.settings, payments: boot.payments, lang, messages, host }}>
          <CartProvider>
            {preview && <PreviewRibbon label={t('preview.ribbon')} />}
            <Header categories={boot.categories} logoUrl={boot.theme?.logoUrl ?? null} pages={boot.pages.filter((p) => p.isPolicy)} />
            <main className="min-h-[60dvh]">{children}</main>
            <Footer boot={boot} t={t} />
          </CartProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
