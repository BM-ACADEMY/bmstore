import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { RequestContext } from '../common/request-context';
import { ListStorefrontProductsQuery, StorefrontCatalogService } from './catalog.service';

/**
 * Public, read-only storefront API. Lives on the store host: the tenant middleware has already resolved the store
 * (unknown host -> 404, SUSPENDED/PARKED -> 403, BUILDING -> served with noindex headers) before any handler runs.
 */
@Public()
@Controller('storefront')
export class StorefrontCatalogController {
  constructor(private readonly catalog: StorefrontCatalogService) {}

  /** Cheapest possible "does this host exist and may it be served" answer, for the storefront middleware. */
  @Get('status')
  status() {
    const t = RequestContext.get()?.tenant;
    if (!t) throw new NotFoundException('Store not found');
    return { name: t.name, slug: t.slug, status: t.status };
  }

  @Get('bootstrap') bootstrap() { return this.catalog.bootstrap(); }
  @Get('home') home() { return this.catalog.home(); }
  @Get('categories') categories() { return this.catalog.categories(); }
  @Get('products') list(@Query() q: ListStorefrontProductsQuery) { return this.catalog.list(q); }
  @Get('products/:slug') product(@Param('slug') slug: string) { return this.catalog.product(slug); }
  @Get('pages/:slug') page(@Param('slug') slug: string) { return this.catalog.page(slug); }
  @Get('sitemap') sitemap() { return this.catalog.sitemap(); }
}
