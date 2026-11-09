-- CreateTable
CREATE TABLE "refund_cases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "client_delay_working_days" INTEGER NOT NULL DEFAULT 0,
    "client_delay_note" TEXT,
    "amount_paid_paise" INTEGER NOT NULL,
    "gst_paise" INTEGER NOT NULL,
    "payment_id" TEXT,
    "invoice_ref" TEXT,
    "eligible" BOOLEAN NOT NULL,
    "decision" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "process_by" TIMESTAMP(3),
    "refund_id" TEXT,
    "refund_stub" BOOLEAN NOT NULL DEFAULT false,
    "refund_error" TEXT,
    "credit_note_no" TEXT,
    "credit_note" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_cases_credit_note_no_key" ON "refund_cases"("credit_note_no");

-- CreateIndex
CREATE INDEX "refund_cases_tenant_id_created_at_idx" ON "refund_cases"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "refund_cases_status_idx" ON "refund_cases"("status");

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_amounts_check" CHECK ("amount_paid_paise" > 0 AND "gst_paise" >= 0 AND "gst_paise" < "amount_paid_paise" AND "client_delay_working_days" >= 0);

-- Row-level security like every tenant table.
ALTER TABLE "refund_cases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "refund_cases" FOR ALL
  USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());
