'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useStore } from '@/lib/store-context';
import { mergePreview, themeVars } from '@/lib/theme';

/**
 * Live preview channel for the owner's theme editor, which embeds the store in an iframe on the same hostname
 * (the admin app on another port in dev, admin.<platform domain> in production). Colour / font / shape changes
 * arrive by postMessage and are applied as CSS variables without a reload; structural changes (layout, sections,
 * header, cards) are written to the host-only preview cookie by the editor, which then asks for a refresh.
 * Only same-hostname origins are listened to; the draft goes through the same whitelist as the cookie.
 */
export function ThemePreviewBridge() {
  const { theme } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (e: MessageEvent) => {
      let origin: URL;
      try { origin = new URL(e.origin); } catch { return; }
      const allowed = origin.hostname === location.hostname || origin.hostname === `admin.${location.hostname.split('.').slice(1).join('.')}`;
      if (!allowed || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'bm-theme-draft') {
        const vars = themeVars(mergePreview(theme, e.data.theme));
        for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
      } else if (e.data.type === 'bm-theme-refresh') {
        router.refresh();
      }
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'bm-theme-ready' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [theme, router]);
  return null;
}
