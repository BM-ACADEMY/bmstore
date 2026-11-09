-- CreateTable
CREATE TABLE "store_domains" (
    "tenant_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "dns_status" TEXT NOT NULL DEFAULT 'pending',
    "dns_seen" TEXT[],
    "dns_checked_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "ssl_status" TEXT NOT NULL DEFAULT 'unknown',
    "ssl_detail" TEXT,
    "ssl_expires_at" TIMESTAMP(3),
    "ssl_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_domains_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_domains_domain_key" ON "store_domains"("domain");

-- AddForeignKey
ALTER TABLE "store_domains" ADD CONSTRAINT "store_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security like every tenant table.
ALTER TABLE "store_domains" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "store_domains" FOR ALL
  USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());
