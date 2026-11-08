-- CreateTable
CREATE TABLE "qa_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "results" JSONB NOT NULL,
    "triggered_by" UUID,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "qa_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qa_runs_tenant_id_started_at_idx" ON "qa_runs"("tenant_id", "started_at");

-- AddForeignKey
ALTER TABLE "qa_runs" ADD CONSTRAINT "qa_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security like every tenant table.
ALTER TABLE "qa_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "qa_runs" FOR ALL
  USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());
