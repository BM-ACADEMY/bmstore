import { BadRequestException, Injectable } from '@nestjs/common';

import { AuthActor } from '../common/request-context';
import { ProductImportService, ImportOptions } from '../imports/product-import.service';
import { MediaService, PresignBatchDto, CompleteDto, ListMediaQuery } from '../media/media.service';
import { MediaWorker } from '../media/media-worker';
import { TenantLimitsService } from '../limits/limits';
import { SettingsService } from '../settings/settings';
import { PrismaService } from '../prisma/prisma.service';
import { ConsoleScope } from './console-scope';
import { LAYOUTS, themeFor } from './layouts';

export interface ApplyThemeInput { layout?: string; primaryColor?: string; secondaryColor?: string; logoUrl?: string | null; bannerUrls?: string[] }

/**
 * Building a store from the console: product import, bulk images, theme. Each call reuses the store admin's own
 * Phase 2 service inside the store's tenant scope, so limits, validation and isolation are exactly the store's.
 */
@Injectable()
export class BuildService {
  constructor(
    private readonly scope: ConsoleScope,
    private readonly prisma: PrismaService,
    private readonly imports: ProductImportService,
    private readonly media: MediaService,
    private readonly worker: MediaWorker,
    private readonly limits: TenantLimitsService,
    private readonly settings: SettingsService,
  ) {}

  async importProducts(actor: AuthActor, tenantId: string, file: Buffer, opts: ImportOptions) {
    const report = await this.scope.inTenant(actor, tenantId, () => this.imports.run(file, opts));
    await this.scope.audit(actor.id, tenantId, 'console.products_imported', {
      filename: opts.filename, dryRun: !!opts.dryRun, mode: opts.mode ?? 'create', imported: report.imported, updated: report.updated, failed: report.failed,
    });
    return report;
  }

  presignImages(actor: AuthActor, tenantId: string, dto: PresignBatchDto) {
    return this.scope.inTenant(actor, tenantId, () => this.media.presign(dto));
  }
  async completeImages(actor: AuthActor, tenantId: string, dto: CompleteDto) {
    const r = await this.scope.inTenant(actor, tenantId, () => this.media.complete(dto));
    if (r.results.some((x) => x.status === 'UPLOADED')) this.worker.poke();
    return r;
  }
  listImages(actor: AuthActor, tenantId: string, q: ListMediaQuery) {
    return this.scope.inTenant(actor, tenantId, () => this.media.list(q));
  }
  getImage(actor: AuthActor, tenantId: string, id: string) {
    return this.scope.inTenant(actor, tenantId, () => this.media.get(id));
  }

  /** Apply a layout's theme defaults plus brand colours / logo. Logo and banners must be this store's own uploads. */
  async applyTheme(actor: AuthActor, tenantId: string, input: ApplyThemeInput) {
    if (input.layout && !LAYOUTS[input.layout]) throw new BadRequestException(`Layout must be one of ${Object.keys(LAYOUTS).join(', ')}`);
    const res = await this.scope.inTenant(actor, tenantId, async () => {
      const cur = await this.settings.getTheme();
      const preset = input.layout ? themeFor(input.layout) : {};
      return this.settings.updateTheme({
        ...preset,
        homepageSections: (preset as any).homepageSections ?? (cur.homepageSections as unknown[]),
        ...(input.primaryColor ? { primaryColor: input.primaryColor.toUpperCase() } : {}),
        ...(input.secondaryColor ? { secondaryColor: input.secondaryColor.toUpperCase() } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.bannerUrls ? { bannerUrls: input.bannerUrls } : {}),
      });
    });
    await this.scope.audit(actor.id, tenantId, 'console.theme_applied', { layout: input.layout ?? null, colours: [input.primaryColor, input.secondaryColor].filter(Boolean) });
    return res;
  }

  getTheme(actor: AuthActor, tenantId: string) {
    return this.scope.inTenant(actor, tenantId, () => this.settings.getTheme());
  }

  usage(actor: AuthActor | null, tenantId: string) {
    return this.scope.inTenant(actor, tenantId, () => this.limits.usage());
  }

  /** Short catalogue summary for the store page (counts only; no invented numbers). */
  catalogSummary(actor: AuthActor, tenantId: string) {
    return this.scope.inTenant(actor, tenantId, async () => {
      const db = this.prisma.db;
      // Sequential on purpose: each scoped query is its own pinned transaction; firing them together can drain the pool.
      const products = await db.product.count();
      const live = await db.product.count({ where: { status: 'ACTIVE' } });
      const withImages = await db.product.count({ where: { images: { isEmpty: false } } });
      const categories = await db.category.count();
      const images = await db.media.count({ where: { status: 'READY' } });
      return { products, live, withImages, withoutImages: products - withImages, categories, images };
    });
  }
}

