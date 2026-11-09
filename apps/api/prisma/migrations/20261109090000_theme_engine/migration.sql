-- Phase 4 theme engine: hero type and a validated options bag on theme_configs; Tamil label on categories.
ALTER TABLE "theme_configs" ADD COLUMN "hero_type" TEXT NOT NULL DEFAULT 'banner',
ADD COLUMN "options" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "categories" ADD COLUMN "name_ta" TEXT;
