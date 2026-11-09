/**
 * Switching a store between layouts is a theme_configs change and nothing else: every product, category, page and
 * URL survives, the home data is the same, and the owner's own words come back exactly. Plus the HTTP side of theme
 * validation and the Tamil category label.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, deleteTenants } from './helpers';
import { makeStore } from './storefront-helpers';

describe('themes and layouts', () => {
  let app: INestApplication;
  const created: string[] = [];
  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await deleteTenants(app.get(PrismaService).base, created); await app.close(); });

  const snapshot = async (host: string) => {
    const api = request(app.getHttpServer());
    const boot = (await api.get('/storefront/bootstrap').set('Host', host).expect(200)).body;
    const home = (await api.get('/storefront/home').set('Host', host).expect(200)).body;
    const list = (await api.get('/storefront/products?pageSize=48').set('Host', host).expect(200)).body;
    const sitemap = (await api.get('/storefront/sitemap').set('Host', host).expect(200)).body;
    const product = (await api.get(`/storefront/products/${list.items[0].slug}`).set('Host', host).expect(200)).body;
    return { boot, home, list, sitemap, product };
  };

  it('v1 -> v2 -> v3 keeps data and URLs intact; only the theme changes', async () => {
    const s = await makeStore(app);
    created.push(s.t.id);
    const token = await s.login();
    const as = () => s.api().put('/store/theme').set('Host', s.host).set('Authorization', `Bearer ${token}`);
    const before = await snapshot(s.host);
    expect(before.boot.theme.layoutVariant).toBe('v1-textile'); // legacy "default" row normalised
    const comparable = (x: Awaited<ReturnType<typeof snapshot>>) => ({
      products: x.list.items.map((p: any) => [p.id, p.slug, p.price, p.variants.map((v: any) => v.id)]),
      total: x.list.total, categories: x.boot.categories.map((c: any) => [c.id, c.slug, c.productCount]), pages: x.boot.pages,
      sitemap: x.sitemap, homeFeatured: x.home.featured.map((p: any) => p.slug), product: { id: x.product.product.id, slug: x.product.product.slug, price: x.product.product.price },
      store: x.boot.store, settings: x.boot.settings, payments: x.boot.payments,
    });
    for (const [layoutVariant, paletteId, fontPairId, cardStyle] of [['v2-grocer', 'v2-grocer', 'baloo-inter', 'compact'], ['v3-retail', 'v3-jewel', 'cormorant-inter', 'framed'], ['v1-textile', 'v1-textile', 'playfair-inter', 'portrait']]) {
      const t = (await as().send({ layoutVariant, paletteId, fontPairId, cardStyle, homepageSections: [{ type: 'categories' }, { type: 'hero', tagline: `Hello ${layoutVariant}`, taglineTa: 'வணக்கம்' }] }).expect(200)).body;
      expect(t.layoutVariant).toBe(layoutVariant);
      const after = await snapshot(s.host);
      expect(comparable(after)).toEqual(comparable(before));
      expect(after.boot.theme).toMatchObject({ layoutVariant, paletteId, fontPairId, cardStyle });
      expect(after.home.sections.slice(0, 2)).toEqual([{ type: 'categories', enabled: true }, { type: 'hero', enabled: true }]);
      expect(after.home.hero).toMatchObject({ tagline: `Hello ${layoutVariant}`, taglineTa: 'வணக்கம்' });
    }
  });

  it('PUT /store/theme: partial updates keep the rest, bad values are listed, options and hero video validated', async () => {
    const s = await makeStore(app);
    created.push(s.t.id);
    const token = await s.login();
    const put = (body: object) => s.api().put('/store/theme').set('Host', s.host).set('Authorization', `Bearer ${token}`).send(body);
    await put({ layoutVariant: 'v3-retail', primaryColor: '#1D1A26', secondaryColor: '#8E4A55', options: { corners: 'sharp', switcherEnabled: true } }).expect(200);
    const t = (await put({ headerStyle: 'minimal' }).expect(200)).body;
    expect(t).toMatchObject({ layoutVariant: 'v3-retail', primaryColor: '#1D1A26', headerStyle: 'minimal', options: { corners: 'sharp', switcherEnabled: true, heroVideoUrl: null } });
    const bad = (await put({ layoutVariant: 'v4', paletteId: 'neon', heroType: 'video', homepageSections: [{ type: 'testimonials' }] }).expect(400)).body;
    expect(bad.message).toEqual(expect.arrayContaining([expect.stringMatching(/layoutVariant/), expect.stringMatching(/paletteId/), expect.stringMatching(/heroVideoUrl/), expect.stringMatching(/testimonials/)]));
    // nothing from the rejected request stuck
    expect((await s.api().get('/store/theme').set('Host', s.host).set('Authorization', `Bearer ${token}`).expect(200)).body).toMatchObject({ layoutVariant: 'v3-retail', heroType: 'banner' });
    await put({ heroType: 'video', options: { heroVideoUrl: 'https://media.example/hero.mp4' } }).expect(200);
    await put({ options: { heroVideoUrl: 'javascript:alert(1)' } }).expect(400);
    // the storefront sees the switcher flag and the video
    const boot = (await s.api().get('/storefront/bootstrap').set('Host', s.host).expect(200)).body;
    expect(boot.theme.options).toMatchObject({ switcherEnabled: true, heroVideoUrl: 'https://media.example/hero.mp4' });
    expect(boot.theme.heroType).toBe('video');
    // vocabulary for the editor
    const v = (await s.api().get('/store/theme/vocabulary').set('Host', s.host).set('Authorization', `Bearer ${token}`).expect(200)).body;
    expect(v.layouts.map((l: any) => l.id)).toEqual(['v1-textile', 'v2-grocer', 'v3-retail']);
    expect(v.palettes).toHaveLength(10);
    expect(v.fontPairs).toHaveLength(6);
  });

  it('categories carry an optional Tamil label; the public API returns it and sorts pack sizes naturally', async () => {
    const s = await makeStore(app);
    created.push(s.t.id);
    const token = await s.login();
    const auth = (r: request.Test) => r.set('Host', s.host).set('Authorization', `Bearer ${token}`);
    await auth(s.api().patch(`/store/categories/${s.cat.id}`)).send({ nameTa: 'புடவைகள்' }).expect(200);
    const cats = (await s.api().get('/storefront/categories').set('Host', s.host).expect(200)).body;
    expect(cats.find((c: any) => c.id === s.cat.id).nameTa).toBe('புடவைகள்');
    await auth(s.api().patch(`/store/categories/${s.cat.id}`)).send({ nameTa: 'x'.repeat(81) }).expect(400);
    const base = app.get(PrismaService).base;
    const rice = await base.product.create({ data: { tenantId: s.t.id, name: 'Ponni Rice', slug: 'ponni-rice', price: 6800, mrp: 7500, stock: 0, status: 'ACTIVE', categoryId: s.cat.id, images: [] } });
    for (const [v, d] of [['1 kg', 0], ['250 g', -5000], ['10 kg', 50000], ['500 g', -3000], ['5 kg', 26000]] as const) await base.variant.create({ data: { tenantId: s.t.id, productId: rice.id, optionName: 'Pack', optionValue: v, priceDelta: d, stock: 3 } });
    const p = (await s.api().get('/storefront/products/ponni-rice').set('Host', s.host).expect(200)).body.product;
    expect(p.variants.map((v: any) => v.optionValue)).toEqual(['250 g', '500 g', '1 kg', '5 kg', '10 kg']);
  });
});
