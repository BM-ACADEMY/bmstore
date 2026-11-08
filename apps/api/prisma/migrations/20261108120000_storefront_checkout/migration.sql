-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cod_charge" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "coupon_code" TEXT,
ADD COLUMN     "customer_note" TEXT,
ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "gst_rate_bp" INTEGER;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "gst_rate_bp" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "next_order_seq" INTEGER NOT NULL DEFAULT 1001,
ADD COLUMN     "unpaid_order_ttl_min" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "razorpay_webhook_secret_enc" TEXT;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "provider_order_id" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "verified_via" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "event_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_tenant_id_order_id_idx" ON "payments"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_provider_payment_id_idx" ON "payments"("tenant_id", "provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_id_key" ON "payments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_provider_provider_order_id_key" ON "payments"("tenant_id", "provider", "provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_tenant_id_provider_event_id_key" ON "webhook_events"("tenant_id", "provider", "event_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_coupon_code_idx" ON "orders"("tenant_id", "coupon_code");

-- CreateIndex
CREATE INDEX "orders_tenant_id_payment_mode_payment_status_expires_at_idx" ON "orders"("tenant_id", "payment_mode", "payment_status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_id_key" ON "orders"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security like every tenant table (the API refuses to boot without it; the gate test attacks it directly).
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "payments" FOR ALL
  USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());

ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "webhook_events" FOR ALL
  USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());

-- Money and stock sanity the application already enforces; the database backs it up.
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_nonnegative" CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "shipping" >= 0 AND "cod_charge" >= 0 AND "tax" >= 0 AND "total" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "variants" ADD CONSTRAINT "variants_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "settings" ADD CONSTRAINT "settings_gst_rate_range" CHECK ("gst_rate_bp" >= 0 AND "gst_rate_bp" <= 10000);
ALTER TABLE "products" ADD CONSTRAINT "products_gst_rate_range" CHECK ("gst_rate_bp" IS NULL OR ("gst_rate_bp" >= 0 AND "gst_rate_bp" <= 10000));
