-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."DocumentStatus" AS ENUM ('pending', 'indexing', 'indexed', 'error', 'deleting');

-- CreateEnum
CREATE TYPE "app"."SourceType" AS ENUM ('web', 'pdf', 'docx', 'txt');

-- CreateTable
CREATE TABLE "app"."app_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "org_name" TEXT,
    "org_phone" TEXT,
    "org_schedule" TEXT,
    "org_address" TEXT,
    "org_website" TEXT,
    "org_e_office" TEXT,
    "preferred_lang" TEXT,
    "channel" TEXT,
    "response_style" TEXT,
    "llm_model" TEXT,
    "llm_model_medium" TEXT,
    "llm_model_small" TEXT,
    "embed_model" TEXT,
    "retrieval_top_k" INTEGER,
    "retrieval_final_k" INTEGER,
    "custom_instructions" TEXT,
    "greeting_message" TEXT,
    "out_of_scope_message" TEXT,
    "chatwoot_base_url" TEXT,
    "chatwoot_api_token" TEXT,
    "enable_handoff" BOOLEAN,
    "handoff_team_id" TEXT,
    "handoff_assignee_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."indexed_documents" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "source_type" "app"."SourceType" NOT NULL,
    "title" TEXT,
    "status" "app"."DocumentStatus" NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "content_hash" TEXT,
    "s3_key" TEXT,
    "auto_reindex" BOOLEAN NOT NULL DEFAULT false,
    "indexed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexed_documents_pkey" PRIMARY KEY ("id")
);

