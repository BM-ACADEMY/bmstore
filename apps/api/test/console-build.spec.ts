import { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../src/prisma/prisma.service';
import { MediaWorker } from '../src/media/media-worker';
import { createApp, deleteTenants, makeTenant } from './helpers';
import { cleanupSuperadmin, superadminSession } from './console-helpers';

describe('console: product import, bulk images, theme apply', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s: Awaited<ReturnType<typeof superadminSession>>;
  const ids: string[] = [];
  let A: any, B: any;

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    s = await superadminSession(app);
    A = await makeTenant(prisma.base, { plan: 'STANDARD' });
    B = await makeTenant(prisma.base, { plan: 'STANDARD' });
    ids.push(A.id, B.id);
  });
  afterAll(async () => {
    await deleteTenants(prisma.base, ids);
    await cleanupSuperadmin(app, s.id);
    await app.close();
  });

  it('imports the client sheet into THAT store with per-row errors; dry run writes nothing; audited', async () => {
    const csv = [
      'name,price,mrp,sku,stock,category,description',
      'Silk saree red,2499,2999,SR-1,4,Sarees,Pure silk',
      'Silk saree blue,abc,2999,SR-2,4,Sarees,', // bad price
      'Cotton saree,899,799,SR-3,4,Sarees,', // mrp < price
      ',100,100,SR-4,1,Sarees,', // no name
      'Dhoti,499,599,SR-5,10,Men,',
    ].join('\n');
    const dry = (await s.call('post', `/superadmin/console/stores/${A.id}/import/products?filename=p.csv&dryRun=true`).set('Content-Type', 'text/csv').send(csv).expect(200)).body;
    expect(dry).toMatchObject({ dryRun: true, totalRows: 5, failed: 3 });
    expect(await prisma.base.product.count({ where: { tenantId: A.id } })).toBe(0);

    const r = (await s.call('post', `/superadmin/console/stores/${A.id}/import/products?filename=p.csv`).set('Content-Type', 'text/csv').send(csv).expect(200)).body;
    expect(r).toMatchObject({ imported: 2, failed: 3 });
    expect(r.errors.map((e: any) => e.row).sort()).toEqual([3, 4, 5]);
    expect(r.errors.every((e: any) => typeof e.reason === 'string' && e.reason.length > 3)).toBe(true);
    expect(await prisma.base.product.count({ where: { tenantId: A.id } })).toBe(2);
    expect(await prisma.base.product.count({ where: { tenantId: B.id } })).toBe(0); // never lands in another store
    const p = await prisma.base.product.findFirstOrThrow({ where: { tenantId: A.id, sku: 'SR-1' } });
    expect(p.price).toBe(249900); // rupees -> paise
    expect(await prisma.base.auditLog.count({ where: { tenantId: A.id, action: 'console.products_imported' } })).toBe(2);
  });

  it('template download works for csv and xlsx', async () => {
    const c = await s.call('get', '/superadmin/console/import/template?format=csv').expect(200);
    expect(c.headers['content-type']).toContain('text/csv');
    const x = await s.call('get', '/superadmin/console/import/template?format=xlsx').expect(200);
    expect(x.headers['content-type']).toContain('spreadsheetml');
  });

  it('bulk image upload (Phase 2 pipeline): presign under the store prefix -> PUT -> complete -> READY; import attaches by filename', async () => {
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 120, b: 60 } } }).jpeg().toBuffer();
    const pre = (await s.call('post', `/superadmin/console/stores/${A.id}/media/presign`).send({ files: [{ filename: 'sr-9.jpg', contentType: 'image/jpeg', size: jpg.length, kind: 'product' }] }).expect(200)).body;
    const f = pre.files[0];
    expect(decodeURIComponent(f.uploadUrl)).toContain(`tenants/${A.id}/`);
    expect((await fetch(f.uploadUrl, { method: 'PUT', headers: f.headers, body: jpg })).status).toBe(200);
    await s.call('post', `/superadmin/console/stores/${A.id}/media/complete`).send({ ids: [f.id] }).expect(200);
    await app.get(MediaWorker).runOnce();
    const m = (await s.call('get', `/superadmin/console/stores/${A.id}/media/${f.id}`).expect(200)).body;
    expect(m.status).toBe('READY');
    // B cannot see or complete A's upload through the console's B door
    await s.call('get', `/superadmin/console/stores/${B.id}/media/${f.id}`).expect(404);
    const listB = (await s.call('get', `/superadmin/console/stores/${B.id}/media`).expect(200)).body;
    expect(listB.items.find((x: any) => x.id === f.id)).toBeUndefined();

    const csv = 'name,price,mrp,sku,image_filename\nWith photo,100,120,SR-9,sr-9.jpg';
    const r = (await s.call('post', `/superadmin/console/stores/${A.id}/import/products?filename=p.csv`).set('Content-Type', 'text/csv').send(csv).expect(200)).body;
    expect(r.imported).toBe(1);
    const p = await prisma.base.product.findFirstOrThrow({ where: { tenantId: A.id, sku: 'SR-9' } });
    expect(p.images[0]).toContain(`/tenants/${A.id}/`);
    // the same filename does not resolve in B
    const rb = (await s.call('post', `/superadmin/console/stores/${B.id}/import/products?filename=p.csv`).set('Content-Type', 'text/csv').send(csv).expect(200)).body;
    expect(rb.warnings.length).toBeGreaterThan(0);
    const pb = await prisma.base.product.findFirstOrThrow({ where: { tenantId: B.id, sku: 'SR-9' } });
    expect(pb.images).toEqual([]);

    const usage = (await s.call('get', `/superadmin/console/stores/${A.id}/usage`).expect(200)).body;
    expect(usage.media.usedBytes).toBeGreaterThan(0);
    expect(usage.products).toMatchObject({ used: 3, limit: 2000 });
    expect(usage.media.limitMb).toBe(10240);
    // store detail serialises once tenant_usage exists (media_bytes is a BigInt)
    await s.call('get', `/superadmin/console/stores/${A.id}`).expect(200);
    const cat = (await s.call('get', `/superadmin/console/stores/${A.id}/catalog`).expect(200)).body;
    expect(cat).toMatchObject({ products: 3, withImages: 1, images: 1 });

    // theme: own logo accepted, another store's logo refused
    await s.call('put', `/superadmin/console/stores/${A.id}/theme`).send({ layout: 'minimal', primaryColor: '#123456', logoUrl: m.url }).expect(200);
    const th = await prisma.base.themeConfig.findUniqueOrThrow({ where: { tenantId: A.id } });
    expect(th).toMatchObject({ layoutVariant: 'minimal', primaryColor: '#123456', cardStyle: 'borderless', logoUrl: m.url });
    await s.call('put', `/superadmin/console/stores/${B.id}/theme`).send({ logoUrl: m.url }).expect(400);
    await s.call('put', `/superadmin/console/stores/${B.id}/theme`).send({ layout: 'neon' }).expect(400);
  });
});
