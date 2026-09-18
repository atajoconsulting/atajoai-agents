-- Per-agent model overrides. Nullable: when unset, config resolution falls
-- back to the global defaults configured from Chatwoot Super Admin.
ALTER TABLE "app"."app_config" ADD COLUMN IF NOT EXISTS "llmModel" TEXT;
ALTER TABLE "app"."app_config" ADD COLUMN IF NOT EXISTS "llmModelSmall" TEXT;
ALTER TABLE "app"."app_config" ADD COLUMN IF NOT EXISTS "embedModel" TEXT;
