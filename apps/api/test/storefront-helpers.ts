import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeTenant, uniq } from './helpers';

export const PW = 'correct-horse-battery';

/** A LIVE tenant with an owner login, settings, theme, a category and ACTIVE products (one with variants). */
export async function makeStore(app: INestApplication, over: Record<string, unknown> = {}) {
  const prisma = app.get(PrismaService);
  const base: PrismaClient = prisma.base;
  const t = await makeTenant(base, { plan: 'STANDARD', status: 'LIVE', gstNumber: '33ABCDE1234F1Z5', address: '1 Main Rd, Kanchipuram', whatsappNumber: '919876543210', supportPhone: '9876543210', ...over });
  const email = `owner-${uniq()}@sf.test`;
  const hash = await app.get(AuthService).hashPassword(PW);
  await base.user.create({ data: { tenantId: t.id, email, passwordHash: hash, role: 'store_owner', phone: '9000000001' } });
  await base.settings.create({ data: { tenantId: t.id, shippingMode: 'FREE_ABOVE', flatRate: 7900, freeAbove: 199900, codEnabled: true, codCharge: 4900, orderPrefix: 'TST', cityRates: [{ city: 'Chennai', ratePaise: 4900 }], lowStockThreshold: 2 } });
  await base.themeConfig.create({ data: { tenantId: t.id } });
  const cat = await base.category.create({ data: { tenantId: t.id, name: 'Sarees', slug: 'sarees' } });
  const plain = await base.product.create({ data: { tenantId: t.id, name: 'Sungudi Saree', slug: 'sungudi-saree', price: 99900, mrp: 129900, stock: 5, status: 'ACTIVE', categoryId: cat.id, hsnCode: '5208', sku: 'SAR-1', images: [] } });
  const withVariants = await base.product.create({ data: { tenantId: t.id, name: 'Kanchipuram Silk', slug: 'kanchipuram-silk', price: 849900, mrp: 999900, stock: 0, status: 'ACTIVE', categoryId: cat.id, hsnCode: '5007', gstRateBp: 1200, images: [] } });
  const vRed = await base.variant.create({ data: { tenantId: t.id, productId: withVariants.id, optionName: 'Colour', optionValue: 'Red', stock: 3, priceDelta: 0 } });
  const vBlue = await base.variant.create({ data: { tenantId: t.id, productId: withVariants.id, optionName: 'Colour', optionValue: 'Blue', stock: 1, priceDelta: 25000 } });
  const draft = await base.product.create({ data: { tenantId: t.id, name: 'Hidden Draft', slug: 'hidden-draft', price: 100, mrp: 100, stock: 9, status: 'DRAFT', images: [] } });
  await base.coupon.createMany({ data: [
    { tenantId: t.id, code: 'TEN', type: 'PERCENT', value: 10, minOrder: 0 },
    { tenantId: t.id, code: 'FLAT200', type: 'FLAT', value: 20000, minOrder: 150000 },
    { tenantId: t.id, code: 'OLD', type: 'PERCENT', value: 50, minOrder: 0, expiresAt: new Date(Date.now() - 1000) },
    { tenantId: t.id, code: 'ONCE', type: 'FLAT', value: 100, minOrder: 0, usageLimit: 1 },
  ] });
  await base.page.create({ data: { tenantId: t.id, slug: 'privacy-policy', title: 'Privacy Policy', content: '<p>We keep your data safe.</p>', isPolicy: true } });
  const host = `${t.subdomain}.localhost`;
  const api = () => request(app.getHttpServer());
  const login = async () => (await api().post('/auth/login').set('Host', host).send({ email, password: PW }).expect(200)).body.accessToken as string;
  return { t, host, email, cat, plain, withVariants, vRed, vBlue, draft, api, login };
}

export const address = { line1: '4 Kamarajar Salai', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001' };
export const checkoutBody = (items: Array<{ productId: string; variantId?: string | null; qty: number }>, over: Record<string, unknown> = {}) => ({
  items, name: 'Meena Lakshmi', phone: '9876500002', email: 'meena@example.com', address, paymentMode: 'COD', ...over,
});
