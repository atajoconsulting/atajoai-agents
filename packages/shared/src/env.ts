import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const isBuildPhase =
  process.env.npm_lifecycle_event === "build" ||
  process.env.NEXT_PHASE === "phase-production-build";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string(),
    MASTRA_DATABASE_URL: z.string(),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    ENCRYPTION_KEY: z.string().length(64),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().optional(),
    AUTH_DISABLED: z.enum(["true", "false"]).default("false"),

    AWS_REGION: z.string().min(1),
    AWS_ENDPOINT_URL_S3: z.string(),
    S3_BUCKET: z.string().default("atajoai"),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),

    QDRANT_URL: z.string().default("http://localhost:6333"),
    QDRANT_API_KEY: z.string().optional(),
    QDRANT_COLLECTION: z.string().default("default"),
    QDRANT_VECTOR_SIZE: z.coerce.number().int().positive().default(1024),

    EMBED_MODEL: z.string(),
    LLM_MODEL: z.string().min(1),
    LLM_MODEL_MEDIUM: z.string().min(1),
    LLM_MODEL_SMALL: z.string().min(1),
    MISTRAL_API_KEY: z.string().optional(),

    MASTRA_INTERNAL_URL: z.string().default("http://agents:4111"),

    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: isBuildPhase,
});
