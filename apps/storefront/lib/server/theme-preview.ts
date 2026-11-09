import 'server-only';
import { cookies } from 'next/headers';
import { mergePreview, ThemeRow } from '@/lib/theme';

/**
 * Browser-side theme preview. The owner's theme editor (and the demo-store switcher) writes a host-only cookie
 * with a draft; the page renders with the draft merged over the stored theme for THAT browser only. Values are
 * whitelisted ids / hex colours / bounded text (lib/theme.ts mergePreview), so a hand-made cookie can at most
 * restyle the viewer's own screen.
 */
export const PREVIEW_COOKIE = 'bm_theme_preview';

export async function applyPreview(theme: ThemeRow): Promise<{ theme: ThemeRow; previewing: boolean }> {
  const raw = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (!raw) return { theme, previewing: false };
  try {
    const draft = JSON.parse(decodeURIComponent(raw));
    return { theme: mergePreview(theme, draft), previewing: true };
  } catch {
    return { theme, previewing: false };
  }
}
