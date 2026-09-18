-- Create GlobalConfig singleton table for instance-wide model/retrieval defaults.
-- AppConfig keeps its model/retrieval columns as nullable (not exposed in UI
-- yet available for future per-tenant overrides).

CREATE TABLE "app"."global_config" (
    "id"              TEXT NOT NULL DEFAULT 'default',
    "llmModel"        TEXT,
    "llmModelSmall"   TEXT,
    "embedModel"      TEXT,
    "retrievalTopK"   INTEGER,
    "retrievalFinalK" INTEGER,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_config_pkey" PRIMARY KEY ("id")
);
