import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const optionalBooleanFlag = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const env = createEnv({
  server: {
    CHATWOOT_API_TOKEN: z.string().min(1).optional(),
    ENCRYPTION_KEY: z
      .string()
      .length(64)
      .regex(/^[0-9a-f]+$/i, "Must be a 64-char hex string (32 bytes)"),
    CHATWOOT_PANEL_API_KEY: z.string().min(1).default("changeme"),
    MASTRA_AUTH_ENABLED: optionalBooleanFlag,
    REDIS_URL: z.string().min(1),
    ENABLE_STARTUP_CHECKS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DATABASE_URL: z.string(),
    MISTRAL_API_KEY: z.string().optional(),
    QDRANT_URL: z.string().default("http://localhost:6333"),
    QDRANT_API_KEY: z.string().optional(),
    QDRANT_COLLECTION: z.string().default("default"),
    QDRANT_VECTOR_SIZE: z.coerce.number().int().positive().default(1024),
    AWS_REGION: z.string().default("eu-west-1"),
    AWS_ENDPOINT_URL_S3: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET: z.string().default("atajoai"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    RATE_LIMIT_PER_CONVERSATION: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
  },
  runtimeEnv: process.env,
});
