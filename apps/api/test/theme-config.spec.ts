import { DEFAULT_SECTIONS, normalizeSections, normalizeTheme, presentTheme, ThemeValidationError } from '../src/theme/theme-config';

/** Theme config validation: every value a store can save is a known id, a 6-digit hex or bounded text. */
describe('theme config validation', () => {
  it('accepts a complete V2 theme and normalises colours to upper-case hex', () => {
    const t = normalizeTheme({
      layoutVariant: 'v2-grocer', paletteId: 'v2-grocer', primaryColor: '#1f6b3a', secondaryColor: '#c8381f', fontPairId: 'baloo-inter',
      headerStyle: 'standard', cardStyle: 'compact', heroType: 'slider', bannerUrls: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
      homepageSections: [{ type: 'categories' }, { type: 'hero', tagline: 'Fresh from the mill', enabled: true }],
      options: { corners: 'round', switcherEnabled: true },
    });
    expect(t.primaryColor).toBe('#1F6B3A');
    expect(t.layoutVariant).toBe('v2-grocer');
    expect(t.options).toEqual({ corners: 'round', switcherEnabled: true, heroVideoUrl: null, bilingualLabels: true });
    // order kept, missing sections appended, about disabled without content
    expect(t.homepageSections.map((s) => s.type)).toEqual(['categories', 'hero', 'offer_strip', 'featured', 'bestsellers', 'about', 'contact']);
    expect(t.homepageSections.find((s) => s.type === 'about')!.enabled).toBe(false);
  });

  it('lists every problem at once', () => {
    let err: ThemeValidationError | null = null;
    try { normalizeTheme({ layoutVariant: 'v9', paletteId: 'neon', primaryColor: 'red', fontPairId: 'comic', headerStyle: 'huge', cardStyle: 'tiny', heroType: 'hologram' }); }
    catch (e) { err = e as ThemeValidationError; }
    expect(err).toBeInstanceOf(ThemeValidationError);
    expect(err!.problems).toHaveLength(7);
    expect(err!.problems.join(' ')).toMatch(/layoutVariant/);
    expect(err!.problems.join(' ')).toMatch(/hex colour/);
  });

  it('maps legacy ids (default layout, serif fonts, maroon palette, round corners in cardStyle)', () => {
    const t = presentTheme({ layoutVariant: 'default', fontPairId: 'serif', paletteId: 'maroon', cardStyle: 'round' });
    expect(t.layoutVariant).toBe('v1-textile');
    expect(t.fontPairId).toBe('playfair-inter');
    expect(t.paletteId).toBe('v1-textile');
    expect(t.cardStyle).toBe('portrait');
    expect(t.options.corners).toBe('round');
  });

  it('a partial update keeps the stored values for the fields it leaves out', () => {
    const base = normalizeTheme({ layoutVariant: 'v3-retail', paletteId: 'v3-jewel', primaryColor: '#1D1A26', secondaryColor: '#8E4A55', fontPairId: 'cormorant-inter' });
    const t = normalizeTheme({ headerStyle: 'centered-logo' }, base);
    expect(t.layoutVariant).toBe('v3-retail');
    expect(t.primaryColor).toBe('#1D1A26');
    expect(t.headerStyle).toBe('centered-logo');
  });

  it('a video hero needs a https video URL', () => {
    expect(() => normalizeTheme({ heroType: 'video' })).toThrow(/heroVideoUrl/);
    expect(() => normalizeTheme({ heroType: 'video', options: { heroVideoUrl: 'http://x/y.mp4' } })).toThrow(/https/);
    expect(normalizeTheme({ heroType: 'video', options: { heroVideoUrl: 'https://media.example/y.mp4' } }).options.heroVideoUrl).toBe('https://media.example/y.mp4');
  });

  it('sections: unknown types and unknown keys are dropped, links are internal paths or http(s), text is bounded', () => {
    const problems: string[] = [];
    const out = normalizeSections([
      { type: 'testimonials', quotes: ['great'] },
      { type: 'offer_strip', text: 'Free delivery above ₹999', href: '/c/all', evil: '<script>' },
      { type: 'hero', ctaHref: 'javascript:alert(1)' },
      { type: 'about', body: 'x'.repeat(2001) },
      { type: 'featured', productIds: ['not-a-uuid', '5f3a7c4e-1b2d-4e8f-9a0b-1c2d3e4f5a6b'] },
    ], problems);
    expect(problems).toEqual(expect.arrayContaining([expect.stringMatching(/unknown section type testimonials/), expect.stringMatching(/hero.ctaHref/), expect.stringMatching(/about.body is longer/)]));
    const offer = out.find((s) => s.type === 'offer_strip')!;
    expect(offer.href).toBe('/c/all');
    expect((offer as any).evil).toBeUndefined();
    expect(out.find((s) => s.type === 'featured')!.productIds).toEqual(['5f3a7c4e-1b2d-4e8f-9a0b-1c2d3e4f5a6b']);
    expect(out.map((s) => s.type).sort()).toEqual([...DEFAULT_SECTIONS].sort());
  });

  it('presentTheme never throws on a corrupt row', () => {
    const t = presentTheme({ layoutVariant: 'garbage', primaryColor: 'nope', homepageSections: 'not-a-list', options: 42 });
    expect(t.layoutVariant).toBe('v1-textile');
    expect(t.primaryColor).toBe('#7A1F2B');
    expect(t.homepageSections).toHaveLength(DEFAULT_SECTIONS.length);
  });
});
