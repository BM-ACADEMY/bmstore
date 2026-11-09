-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "went_live_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "store_intakes" (
    "tenant_id" UUID NOT NULL,
    "intake_key" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "owner_name" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "category" TEXT,
    "logo_url" TEXT,
    "brand_colors" TEXT[],
    "product_sheet" TEXT,
    "gst_number" TEXT,
    "address" TEXT,
    "domain" TEXT,
    "razorpay_status" TEXT NOT NULL DEFAULT 'not_started',
    "shipping" JSONB NOT NULL DEFAULT '{}',
    "cod_enabled" BOOLEAN,
    "cod_charge_paise" INTEGER NOT NULL DEFAULT 0,
    "about_text" TEXT,
    "layout" TEXT NOT NULL DEFAULT 'classic',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "chasers_sent" INTEGER NOT NULL DEFAULT 0,
    "last_chased_at" TIMESTAMP(3),
    "parked_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_intakes_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_intakes_intake_key_key" ON "store_intakes"("intake_key");

-- CreateIndex
CREATE INDEX "store_intakes_completed_at_received_at_idx" ON "store_intakes"("completed_at", "received_at");

-- AddForeignKey
ALTER TABLE "store_intakes" ADD CONSTRAINT "store_intakes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security like every tenant table.
ALTER TABLE "store_intakes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "store_intakes" FOR ALL
  USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());
