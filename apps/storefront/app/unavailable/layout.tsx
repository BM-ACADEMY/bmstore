import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { themeVars } from '@/lib/theme';
import '../globals.css';

const inter = localFont({ src: '../../public/fonts/Inter.woff2', variable: '--font-inter', display: 'swap', weight: '100 900' });
const playfair = localFont({ src: '../../public/fonts/PlayfairDisplay.woff2', variable: '--font-playfair', display: 'swap', weight: '400 900' });
const tamil = localFont({ src: '../../public/fonts/NotoSansTamil.woff2', variable: '--font-tamil', display: 'swap', weight: '100 900', preload: false });

export const metadata = { title: 'Store unavailable', robots: { index: false, follow: false } };

/** Standalone shell: there is no store to fetch a theme from, so the platform defaults are used. */
export default function UnavailableLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} ${tamil.variable}`} style={themeVars(null) as React.CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
