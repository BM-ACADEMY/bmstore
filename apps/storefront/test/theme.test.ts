// Theme maths: every curated palette passes WCAG AA for every text/background pair the layouts rely on, preview
// drafts are whitelisted, and the shape scale follows the corner option.   Run: npm test (node --test, type stripping)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrast, contrastReport, DEFAULT_THEME, FONT_PAIRS, LAYOUTS, mergePreview, PALETTES, themeVars, type ThemeRow } from '../lib/theme.ts';

const rowFor = (paletteId: string, over: Partial<ThemeRow> = {}): ThemeRow => {
  const p = PALETTES[paletteId];
  return { ...DEFAULT_THEME, paletteId, primaryColor: p?.primary ?? DEFAULT_THEME.primaryColor, secondaryColor: p?.secondary ?? DEFAULT_THEME.secondaryColor, ...over };
};

test('every curated palette is AA (>= 4.5:1) on every text pair, in every layout', () => {
  for (const id of Object.keys(PALETTES)) for (const layoutVariant of LAYOUTS) {
    const report = contrastReport(rowFor(id, { layoutVariant }));
    const failing = report.filter((r) => !r.ok);
    assert.deepEqual(failing, [], `${id}/${layoutVariant}: ${failing.map((f) => `${f.pair}=${f.ratio}`).join(', ')}`);
  }
});

test('a light custom primary is darkened where it is used as text, and buttons get dark text', () => {
  const v = themeVars(rowFor('custom', { paletteId: 'custom', primaryColor: '#F5D76E', secondaryColor: '#9CA3AF' }));
  assert.ok(contrast(v['--sf-primary-text'], v['--sf-bg']) >= 4.5);
  assert.equal(v['--sf-primary'], '#f5d76e'); // the button colour itself is untouched
  assert.notEqual(v['--sf-on-primary'], '#ffffff');
  assert.ok(contrast(v['--sf-on-primary'], v['--sf-primary']) >= 4.5);
});

test('all six font pairs carry a Tamil fallback and known faces', () => {
  for (const f of Object.values(FONT_PAIRS)) {
    const v = themeVars(rowFor('classic', { fontPairId: f.id }));
    assert.match(v['--sf-font-heading'], /Noto Sans Tamil/);
    assert.match(v['--sf-font-body'], /Noto Sans Tamil/);
    assert.ok(/Playfair|Inter|Baloo|Cormorant|Noto Serif Tamil/.test(v['--sf-font-heading']));
  }
});

test('corners drive the radius scale', () => {
  const r = (corners: ThemeRow['options']['corners']) => themeVars(rowFor('classic', { options: { ...DEFAULT_THEME.options, corners } }));
  assert.equal(r('sharp')['--sf-radius'], '2px');
  assert.equal(r('sharp')['--sf-radius-pill'], '4px');
  assert.equal(r('round')['--sf-radius'], '18px');
  assert.equal(r('soft')['--sf-radius-pill'], '999px');
});

test('mergePreview: unknown ids, bad colours, non-https media and the switcher flag never come from a cookie', () => {
  const base = rowFor('v1-textile');
  const out = mergePreview(base, {
    layoutVariant: 'v2-grocer', paletteId: 'neon', primaryColor: 'red', secondaryColor: '#1F6B3A', fontPairId: 'comic', cardStyle: 'compact',
    logoUrl: 'javascript:alert(1)', bannerUrls: ['https://ok.example/a.jpg', 'data:image/png;base64,xx'],
    homepageSections: [{ type: 'testimonials' }, { type: 'contact', enabled: false }, { type: 'hero', tagline: 'Draft', evil: { nested: true } }],
    options: { switcherEnabled: true, corners: 'sharp', heroVideoUrl: 'http://insecure/x.mp4' },
  });
  assert.equal(out.layoutVariant, 'v2-grocer');
  assert.equal(out.paletteId, 'v1-textile');
  assert.equal(out.primaryColor, base.primaryColor);
  assert.equal(out.secondaryColor, '#1F6B3A');
  assert.equal(out.fontPairId, base.fontPairId);
  assert.equal(out.cardStyle, 'compact');
  assert.equal(out.logoUrl, null);
  assert.deepEqual(out.bannerUrls, ['https://ok.example/a.jpg']);
  assert.equal(out.homepageSections[0].type, 'contact');
  assert.equal(out.homepageSections[0].enabled, false);
  assert.equal(out.homepageSections.length, 7);
  assert.equal(out.homepageSections.find((s) => s.type === 'hero')!.tagline, 'Draft');
  assert.equal(out.homepageSections.find((s) => s.type === 'hero')!.evil, undefined);
  assert.equal(out.options.switcherEnabled, false);
  assert.equal(out.options.corners, 'sharp');
  assert.equal(out.options.heroVideoUrl, null);
  assert.equal(mergePreview(base, 'garbage'), base);
});
