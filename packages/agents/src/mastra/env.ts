import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    MASTRA_DATABASE_URL: z.string(),
    DATABASE_URL: z.string(),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    QDRANT_URL: z.string().default("http://localhost:6333"),
    QDRANT_API_KEY: z.string().optional(),
    QDRANT_COLLECTION: z.string().default("default"),
    QDRANT_VECTOR_SIZE: z.coerce.number().int().positive().default(1024),
    EMBED_MODEL: z.string(),
    LLM_MODEL: z.string().min(1),
    LLM_MODEL_MEDIUM: z.string().min(1),
    LLM_MODEL_SMALL: z.string().min(1),
    MISTRAL_API_KEY: z.string().optional(),
    ENCRYPTION_KEY: z.string().length(64),
    AWS_REGION: z.string().min(1),
    AWS_ENDPOINT_URL_S3: z.string(),
    S3_BUCKET: z.string().default("atajoai"),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  runtimeEnv: process.env,
});
