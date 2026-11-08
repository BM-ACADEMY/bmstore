import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { StorefrontCatalogController } from './catalog.controller';
import { StorefrontCatalogService } from './catalog.service';

/** Customer-facing API: catalogue, checkout, payments, order lookup. All routes are public and tenant-bound by Host. */
@Module({ imports: [CryptoModule], controllers: [StorefrontCatalogController], providers: [StorefrontCatalogService], exports: [StorefrontCatalogService] })
export class StorefrontModule {}
