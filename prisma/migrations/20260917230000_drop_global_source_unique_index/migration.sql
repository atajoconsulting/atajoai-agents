-- The multi-tenant migration (20260603000000) intended to replace the
-- pre-multi-tenant global unique (source, "sourceType") with the
-- tenant-scoped unique (tenantId, source, "sourceType"), but
-- DROP CONSTRAINT IF EXISTS is a silent no-op for a standalone unique
-- INDEX (created via CREATE UNIQUE INDEX, not ADD CONSTRAINT). The global
-- index survived, so two tenants could never index the same URL or file
-- (insert violated indexed_documents_source_sourceType_key) — breaking the
-- multi-tenant model where many municipalities index the same public pages.
DROP INDEX IF EXISTS "app"."indexed_documents_source_sourceType_key";
