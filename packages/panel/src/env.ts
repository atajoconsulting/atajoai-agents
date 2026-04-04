import 'dotenv/config'
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  skipValidation:
    process.env.npm_lifecycle_event === "build" ||
    process.env.NEXT_PHASE === "phase-production-build",
  server: {
    DATABASE_URL: z.string(),
    MASTRA_INTERNAL_URL: z.string().default("http://agents:4111"),
    AWS_REGION: z.string().min(1),
    AWS_ENDPOINT_URL_S3: z.string(),
    S3_BUCKET: z.string().default("atajoai"),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().optional(),
    ENCRYPTION_KEY: z.string().length(64),
    AUTH_DISABLED: z.enum(["true", "false"]).default("false"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    MASTRA_INTERNAL_URL: process.env.MASTRA_INTERNAL_URL,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ENDPOINT_URL_S3: process.env.AWS_ENDPOINT_URL_S3,
    S3_BUCKET: process.env.S3_BUCKET,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    AUTH_DISABLED: process.env.AUTH_DISABLED,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
