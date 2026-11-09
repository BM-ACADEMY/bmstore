import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { RequestContext, TenantInfo } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { TenantSecretsService } from '../crypto/tenant-secrets.service';
import { presentCategory, presentProduct, PublicProduct } from './present';
import { parseItems } from '../orders/order-items';
import { presentTheme } from '../theme/theme-config';

export const PRODUCT_SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'name'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export class ListStorefrontProductsQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string; // slug (includes sub-categories)
  @IsOptional() @IsIn(PRODUCT_SORTS as unknown as string[]) sort?: ProductSort = 'featured';
  /** paise */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @IsIn(['1', '0', 'true', 'false']) inStock?: string;
  /** "Colour:Red" style option filters, repeatable as comma list */
  @IsOptional() @IsString() @MaxLength(200) option?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48) pageSize?: number = 24;
}

const INCLUDE = { variants: { orderBy: [{ optionName: 'asc' }, { optionValue: 'asc' }] }, category: { select: { id: true, name: true, slug: true } } } satisfies Prisma.ProductInclude;
const ACTIVE = { status: 'ACTIVE' } as const;

/** Read-only, public catalogue for the storefront. Every query runs in the Host-resolved tenant (extension + RLS). */
@Injectable()
export class StorefrontCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly secrets: TenantSecretsService) {}
  private get db() { return this.prisma.db; }
  private tenant(): TenantInfo {
    const t = RequestContext.get()?.tenant;
    if (!t) throw new NotFoundException('Store not found');
    return t;
  }

  /** Everything the layout needs in one call: store, theme, settings (public part), category tree, policy pages, payment options. */
  async bootstrap() {
    const t = this.tenant();
    const [theme, settings, categories, pages, rzp] = await Promise.all([
      this.db.themeConfig.findUnique({ where: { tenantId: t.id } }),
      this.db.settings.findUnique({ where: { tenantId: t.id } }),
      this.categories(),
      this.db.page.findMany({ orderBy: [{ isPolicy: 'desc' }, { title: 'asc' }], select: { slug: true, title: true, isPolicy: true } }),
      this.secrets.getRazorpayCredentials().catch(() => null),
    ]);
    return {
      store: { name: t.name, slug: t.slug, status: t.status, address: t.address, gstNumber: t.gstNumber, supportPhone: t.supportPhone, whatsappNumber: t.whatsappNumber },
      theme: presentTheme(theme ?? {}),
      settings: settings
        ? { shippingMode: settings.shippingMode, flatRate: settings.flatRate, freeAbove: settings.freeAbove, codEnabled: settings.codEnabled, codCharge: settings.codCharge, cities: ((settings.cityRates as any[]) ?? []).map((c) => ({ city: c.city, ratePaise: c.ratePaise })), lowStockThreshold: settings.lowStockThreshold }
        : { shippingMode: 'FLAT', flatRate: 0, freeAbove: null, codEnabled: true, codCharge: 0, cities: [], lowStockThreshold: 5 },
      payments: { cod: settings?.codEnabled ?? true, online: Boolean(rzp) },
      categories,
      pages,
    };
  }

  /** Flat list (parents first) with live product counts, so the storefront can build circles, menus and breadcrumbs. */
  async categories() {
    const rows = await this.db.category.findMany({ orderBy: { name: 'asc' } });
    const counts = await this.db.product.groupBy({ by: ['categoryId'], where: ACTIVE, _count: { _all: true } });
    const byCat = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    // a parent's count includes its children (3 levels max)
    const childrenOf = new Map<string | null, typeof rows>();
    for (const c of rows) childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c]);
    const total = (id: string): number => (byCat.get(id) ?? 0) + (childrenOf.get(id) ?? []).reduce((n, ch) => n + total(ch.id), 0);
    return rows.map((c) => presentCategory({ ...c, productCount: total(c.id) }));
  }

  /** Home page data. Bestsellers come from real orders (quantities sold in the last 90 days), never invented. */
  async home() {
    const t = this.tenant();
    const [theme, settings, categories, newest, bestsellers] = await Promise.all([
      this.db.themeConfig.findUnique({ where: { tenantId: t.id } }),
      this.db.settings.findUnique({ where: { tenantId: t.id } }),
      this.categories(),
      this.db.product.findMany({ where: ACTIVE, orderBy: { createdAt: 'desc' }, take: 8, include: INCLUDE }),
      this.bestsellers(8),
    ]);
    const normalized = presentTheme(theme ?? {});
    const sections = normalized.homepageSections;
    const featuredIds: string[] = sections.find((s) => s.type === 'featured')?.productIds ?? [];
    let featured = newest;
    if (featuredIds.length) {
      const picked = await this.db.product.findMany({ where: { ...ACTIVE, id: { in: featuredIds } }, include: INCLUDE });
      const order = new Map(featuredIds.map((id, i) => [id, i]));
      featured = picked.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    const offer = sections.find((s) => s.type === 'offer_strip');
    const hero = sections.find((s) => s.type === 'hero');
    const about = sections.find((s) => s.type === 'about');
    const featuredSection = sections.find((s) => s.type === 'featured');
    return {
      /** Section order + enabled flags come from the theme; the data below is keyed by type. */
      sections: sections.map((s) => ({ type: s.type, enabled: s.enabled })),
      offer: offer?.text || offer?.textTa ? { text: offer.text ?? '', textTa: offer.textTa ?? null, href: offer.href ?? null } : null,
      hero: { type: normalized.heroType, bannerUrls: normalized.bannerUrls, videoUrl: normalized.options.heroVideoUrl, tagline: hero?.tagline ?? null, taglineTa: hero?.taglineTa ?? null, ctaLabel: hero?.ctaLabel ?? null, ctaLabelTa: hero?.ctaLabelTa ?? null, ctaHref: hero?.ctaHref ?? null },
      about: about?.enabled ? { title: about.title ?? null, titleTa: about.titleTa ?? null, body: about.body ?? null, bodyTa: about.bodyTa ?? null, imageUrl: about.imageUrl ?? null } : null,
      featuredTitle: featuredSection ? { title: featuredSection.title ?? null, titleTa: featuredSection.titleTa ?? null } : null,
      shipping: settings ? { mode: settings.shippingMode, flatRate: settings.flatRate, freeAbove: settings.freeAbove, codEnabled: settings.codEnabled } : null,
      categories: categories.filter((c) => !c.parentId),
      featured: featured.map(presentProduct),
      bestsellers,
      contact: { phone: t.supportPhone, whatsapp: t.whatsappNumber, address: t.address },
    };
  }

  /** Products ordered by units actually sold in the last 90 days (excluding cancelled/returned orders). Empty when there are no sales. */
  async bestsellers(limit: number): Promise<PublicProduct[]> {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const orders = await this.db.order.findMany({ where: { createdAt: { gte: since }, orderStatus: { notIn: ['CANCELLED', 'RETURNED'] } }, select: { items: true }, orderBy: { createdAt: 'desc' }, take: 1000 });
    const sold = new Map<string, number>();
    for (const o of orders) for (const it of parseItems(o.items)) if (it.productId) sold.set(it.productId, (sold.get(it.productId) ?? 0) + it.qty);
    if (!sold.size) return [];
    const ids = [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit * 2).map(([id]) => id);
    const products = await this.db.product.findMany({ where: { ...ACTIVE, id: { in: ids } }, include: INCLUDE });
    return products.sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0)).slice(0, limit).map(presentProduct);
  }

  async list(q: ListStorefrontProductsQuery) {
    const where: Prisma.ProductWhereInput = { ...ACTIVE };
    let category: ReturnType<typeof presentCategory> | null = null;
    const all = await this.categories();
    if (q.category) {
      category = all.find((c) => c.slug === q.category) ?? null;
      if (!category) throw new NotFoundException('Category not found');
      const ids = new Set<string>([category.id]);
      let grew = true;
      while (grew) { grew = false; for (const c of all) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); grew = true; } }
      where.categoryId = { in: [...ids] };
    }
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }];
    if (q.minPrice !== undefined || q.maxPrice !== undefined) where.price = { ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}) };
    if (q.inStock === '1' || q.inStock === 'true') where.OR = [...(where.OR ? [{ AND: [{ OR: where.OR }] }] : []), { stock: { gt: 0 } }, { variants: { some: { stock: { gt: 0 } } } }];
    if (q.option) {
      for (const pair of q.option.split(',').map((s) => s.trim()).filter(Boolean)) {
        const [name, value] = pair.split(':');
        if (name && value) where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { variants: { some: { optionName: { equals: name, mode: 'insensitive' }, optionValue: { equals: value, mode: 'insensitive' } } } }];
      }
    }
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'price_asc' ? [{ price: 'asc' }] : q.sort === 'price_desc' ? [{ price: 'desc' }] : q.sort === 'name' ? [{ name: 'asc' }] : q.sort === 'newest' ? [{ createdAt: 'desc' }] : [{ stock: 'desc' }, { createdAt: 'desc' }];
    const page = q.page ?? 1, pageSize = q.pageSize ?? 24;
    const [items, total, facets] = await Promise.all([
      this.db.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: INCLUDE }),
      this.db.product.count({ where }),
      this.facets(where),
    ]);
    return { items: items.map(presentProduct), total, page, pageSize, category, facets, children: category ? all.filter((c) => c.parentId === category!.id) : [] };
  }

  /** Price range and variant options available within the current filter (so the filter UI shows real choices only). */
  private async facets(where: Prisma.ProductWhereInput) {
    const agg = await this.db.product.aggregate({ where, _min: { price: true }, _max: { price: true } });
    const opts = await this.db.variant.groupBy({ by: ['optionName', 'optionValue'], where: { product: where }, _count: { _all: true }, orderBy: [{ optionName: 'asc' }, { optionValue: 'asc' }] });
    const options: Record<string, string[]> = {};
    for (const o of opts) (options[o.optionName] ??= []).push(o.optionValue);
    return { minPrice: agg._min.price ?? 0, maxPrice: agg._max.price ?? 0, options };
  }

  async product(slug: string) {
    const p = await this.db.product.findFirst({ where: { slug, ...ACTIVE }, include: INCLUDE });
    if (!p) throw new NotFoundException('Product not found');
    const related = await this.db.product.findMany({ where: { ...ACTIVE, id: { not: p.id }, ...(p.categoryId ? { categoryId: p.categoryId } : {}) }, take: 8, orderBy: { createdAt: 'desc' }, include: INCLUDE });
    return { product: presentProduct(p), related: related.map(presentProduct) };
  }

  async page(slug: string) {
    const p = await this.db.page.findFirst({ where: { slug }, select: { slug: true, title: true, content: true, isPolicy: true } });
    if (!p) throw new NotFoundException('Page not found');
    return p;
  }

  /** Slugs for sitemap.xml: products, categories, pages, with last-modified where known. */
  async sitemap() {
    const [products, categories, pages] = await Promise.all([
      this.db.product.findMany({ where: ACTIVE, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 5000 }),
      this.db.category.findMany({ select: { slug: true } }),
      this.db.page.findMany({ select: { slug: true } }),
    ]);
    return { products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt.toISOString() })), categories: categories.map((c) => c.slug), pages: pages.map((p) => p.slug) };
  }
}
