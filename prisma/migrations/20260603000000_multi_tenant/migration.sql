-- Multi-tenant refactor:
--   * AppConfig is no longer a singleton — each row is keyed by tenant id.
--   * chatwootBaseUrl is global (env CHATWOOT_BASE_URL); dropped from the table.
--   * IndexedDocument.tenantId is added and the unique constraint
--     ([source, sourceType]) becomes ([tenantId, source, sourceType]).

-- Step 1: drop the default singleton (if any) and the default value on the PK.
DELETE FROM "app"."app_config" WHERE "id" = 'default';

ALTER TABLE "app"."app_config"
  DROP COLUMN IF EXISTS "chatwootBaseUrl";

ALTER TABLE "app"."app_config"
  ALTER COLUMN "id" DROP DEFAULT;

-- Step 2: add IndexedDocument.tenantId.
-- We have to backfill existing rows with a placeholder before making the column NOT NULL.
ALTER TABLE "app"."indexed_documents"
  ADD COLUMN "tenantId" TEXT;

-- Backfill: any pre-existing rows belong to the previous single-tenant instance.
UPDATE "app"."indexed_documents" SET "tenantId" = 'legacy' WHERE "tenantId" IS NULL;

ALTER TABLE "app"."indexed_documents"
  ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "indexed_documents_tenantId_idx" ON "app"."indexed_documents"("tenantId");

-- Step 3: replace the old unique constraint to include tenantId.
ALTER TABLE "app"."indexed_documents" DROP CONSTRAINT IF EXISTS "indexed_documents_source_sourceType_key";
ALTER TABLE "app"."indexed_documents"
  ADD CONSTRAINT "indexed_documents_tenantId_source_sourceType_key"
  UNIQUE ("tenantId", "source", "sourceType");
