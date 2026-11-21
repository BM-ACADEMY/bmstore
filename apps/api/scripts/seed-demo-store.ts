import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PagesService } from '../src/content/pages';
import { ProductImportService } from '../src/imports/product-import.service';
import { MediaWorker } from '../src/media/media-worker';
import { MediaService } from '../src/media/media.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ObjectStorageService } from '../src/storage/object-storage.service';
import { TenantResolver } from '../src/tenancy/tenant-resolver.service';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function parseCsv(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ''; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0]) rows.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const TONES = ['#2f6b3a', '#a8561b', '#7a3b1f', '#8a6d1a', '#4f6b2a', '#9c3d2e', '#2b5d6b', '#6b3a5c'];
const tone = (s: string) => TONES[[...s].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TONES.length];
async function tile(name: string, category: string, w: number, h: number, bg: string, fs: number): Promise<Buffer> {
  const label = name.length > 28 ? name.slice(0, 27) + '…' : name;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${bg}"/><circle cx="${w * 0.8}" cy="${h * 0.25}" r="${w * 0.22}" fill="#ffffff" fill-opacity="0.12"/><rect x="0" y="${h - 14}" width="${w}" height="14" fill="#ffffff" fill-opacity="0.35"/><text x="60" y="${h * 0.5}" font-family="sans-serif" font-size="${fs}" fill="#ffffff">${esc(label)}</text><text x="60" y="${h * 0.5 + fs}" font-family="sans-serif" font-size="${fs * 0.6}" fill="#ffffff" fill-opacity="0.75">${esc(category)}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
}

(async () => {
  const key = process.env.DEMO_CSV!; const slug = process.env.DEMO_SLUG!; const password = process.env.DEMO_PASSWORD!;
  const cfg = JSON.parse(readFileSync('/demo/stores.json', 'utf8')).stores.find((s: any) => s.catalog_csv === `${key}.csv`);
  const csv = readFileSync(`/demo/${key}.csv`);
  const rows = parseCsv(csv.toString('utf8')).slice(1);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService); const auth = app.get(AuthService); const imports = app.get(ProductImportService);
    const media = app.get(MediaService); const worker = app.get(MediaWorker); const storage = app.get(ObjectStorageService); const pages = app.get(PagesService);
    const old = await prisma.base.tenant.findUnique({ where: { slug } });
    if (old) {
      const files = await prisma.base.media.findMany({ where: { tenantId: old.id } });
      await storage.delete(files.flatMap((m) => [m.originalKey, m.key, m.thumbKey]));
      await prisma.base.tenant.delete({ where: { id: old.id } });
    }
    const s = cfg.settings; const t = cfg.theme;
    // stores.json holds placeholder address/phone values; a public demo must not show them
    // (WhatsApp buttons would point at a dead number). The owner fills these in Settings.
    const tenant = await prisma.base.tenant.create({ data: { name: cfg.name, slug, subdomain: slug, plan: 'STANDARD', status: 'LIVE' } });
    await app.get(TenantResolver).invalidate({ subdomain: slug }, old ?? {});
    const hash = await auth.hashPassword(password);
    await prisma.base.user.create({ data: { tenantId: tenant.id, email: `owner@${slug}.test`, passwordHash: hash, role: 'store_owner' } });
    await prisma.base.settings.create({ data: { tenantId: tenant.id, shippingMode: 'FREE_ABOVE', flatRate: s.flat_rate * 100, freeAbove: s.free_above * 100, codEnabled: s.cod_enabled, codCharge: s.cod_charge * 100, orderPrefix: s.order_prefix } });
    await prisma.base.themeConfig.create({ data: { tenantId: tenant.id, layoutVariant: 'v1-textile', paletteId: key === 'foods' ? 'forest' : 'classic', primaryColor: t.primary_color, secondaryColor: t.secondary_color, fontPairId: key === 'foods' ? 'modern' : 'serif', headerStyle: 'centered-logo', cardStyle: 'portrait',
      homepageSections: [{ type: 'offer_strip', text: s.dispatch_note.split(';')[0].replace(/\.$/, '') }, { type: 'hero', tagline: cfg.tagline.en, taglineTa: cfg.tagline.ta }] } });
    const out = await prisma.runAsTenant(tenant.id, async () => {
      const db = prisma.db;
      const files = await Promise.all(rows.map(async (r) => ({ filename: r[8], bytes: await tile(r[0], r[6], 1200, 1500, tone(r[6]), 64) })));
      const pre = await media.presign({ files: files.map((f) => ({ filename: f.filename, contentType: 'image/jpeg', size: f.bytes.length, kind: 'product' as const })) });
      const byId = new Map(pre.files.map((p, i) => [p.id, files[i]]));
      for (const p of pre.files) { const m = await db.media.findUniqueOrThrow({ where: { id: p.id } }); await storage.put(m.originalKey, byId.get(p.id)!.bytes, 'image/jpeg'); }
      await media.complete({ ids: pre.files.map((p) => p.id) });
      const banner = await tile(cfg.name, cfg.tagline.en, 1800, 1000, t.primary_color, 96);
      const bpre = await media.presign({ files: [{ filename: 'hero-banner.jpg', contentType: 'image/jpeg', size: banner.length, kind: 'banner' }] });
      await storage.put((await db.media.findUniqueOrThrow({ where: { id: bpre.files[0].id } })).originalKey, banner, 'image/jpeg');
      await media.complete({ ids: [bpre.files[0].id] });
      await worker.runOnce(60);
      const br = await db.media.findUnique({ where: { id: bpre.files[0].id } });
      if (br?.key) await db.themeConfig.update({ where: { tenantId: tenant.id }, data: { bannerUrls: [storage.publicUrl(br.key)] } });
      const report = await imports.run(csv, { filename: `${key}.csv`, status: 'ACTIVE' });
      for (const c of await db.category.findMany()) {
        const first = await db.product.findFirst({ where: { categoryId: c.id, images: { isEmpty: false } }, orderBy: { name: 'asc' } });
        if (first) await db.category.update({ where: { id: c.id }, data: { image: first.images[0] } });
      }
      await db.coupon.createMany({ data: [{ tenantId: tenant.id, code: 'WELCOME10', type: 'PERCENT', value: 10, minOrder: 49900 }] });
      await pages.ensurePolicyPages();
      await db.page.create({ data: { tenantId: tenant.id, slug: 'about-us', title: 'About us', content: `<p>${esc(cfg.about)}</p>` } });
      return { imported: report.imported, failed: report.failed, errs: report.errors, ready: await db.media.count({ where: { status: 'READY' } }) };
    });
    console.log(`DONE ${slug}: imported=${out.imported} failed=${out.failed} imagesReady=${out.ready}`);
    for (const e of out.errs) console.log(`row ${e.row}: ${e.reason}`);
  } finally { await app.close(); }
})().catch((e) => { console.error('seed failed:', e instanceof Error ? e.message : e); process.exit(1); });
