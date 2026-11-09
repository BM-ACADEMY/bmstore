/**
 * The three Phase 4 demo tenants, one per layout, differing only by catalogue and theme_configs:
 *   silks.localhost  V1 Fashion / Textile      jewels.localhost  V3 General retail / Jewellery
 *   foods.localhost  V2 Food / Grocery
 * Owner login for each: owner@<slug>.test / demo-password-123 (or DEMO_PASSWORD).
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { seedDemo } from './seed-demo';
import { PresetId } from './seed-presets';

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    for (const preset of ['silks', 'foods', 'jewels'] as PresetId[]) {
      const r = await seedDemo(app, { slug: preset, preset, password: process.env.DEMO_PASSWORD, quiet: true });
      console.log(`${preset}: ${r.products} products, ${r.images} images, ${r.orders} orders -> http://${preset}.localhost:3002 (admin :3001, owner@${preset}.test)`);
      for (const w of r.warnings) console.warn('  warning:', w);
    }
  } finally { await app.close(); }
})().catch((e) => { console.error('seed failed:', e instanceof Error ? e.message : e); process.exit(1); });
