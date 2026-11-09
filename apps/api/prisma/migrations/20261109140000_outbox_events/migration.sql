-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_created_at_idx" ON "outbox_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_kind_status_idx" ON "outbox_events"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_tenant_id_dedupe_key_key" ON "outbox_events"("tenant_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security like every tenant table.
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "outbox_events" FOR ALL
  USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());
