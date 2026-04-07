ALTER TABLE "app"."app_config"
  RENAME COLUMN "org_name" TO "orgName";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "org_phone" TO "orgPhone";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "org_schedule" TO "orgSchedule";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "org_address" TO "orgAddress";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "org_website" TO "orgWebsite";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "org_e_office" TO "orgEOffice";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "preferred_lang" TO "preferredLang";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "response_style" TO "responseStyle";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "llm_model" TO "llmModel";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "llm_model_medium" TO "llmModelMedium";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "llm_model_small" TO "llmModelSmall";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "embed_model" TO "embedModel";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "retrieval_top_k" TO "retrievalTopK";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "retrieval_final_k" TO "retrievalFinalK";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "custom_instructions" TO "customInstructions";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "greeting_message" TO "greetingMessage";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "out_of_scope_message" TO "outOfScopeMessage";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "chatwoot_base_url" TO "chatwootBaseUrl";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "chatwoot_api_token" TO "chatwootApiToken";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "enable_handoff" TO "enableHandoff";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "handoff_team_id" TO "handoffTeamId";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "handoff_assignee_id" TO "handoffAssigneeId";

ALTER TABLE "app"."app_config"
  RENAME COLUMN "updated_at" TO "updatedAt";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "source_type" TO "sourceType";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "error_message" TO "errorMessage";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "chunk_count" TO "chunkCount";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "content_hash" TO "contentHash";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "s3_key" TO "s3Key";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "auto_reindex" TO "autoReindex";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "indexed_at" TO "indexedAt";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "created_at" TO "createdAt";

ALTER TABLE "app"."indexed_documents"
  RENAME COLUMN "updated_at" TO "updatedAt";
