import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CHATWOOT_BASE_URL: z.url(),
    CHATWOOT_API_TOKEN: z.string().min(1),
    EMBED_MODEL: z.string(),
    LLM_MODEL: z.string().min(1),
    LLM_MODEL_MEDIUM: z.string().min(1),
    LLM_MODEL_SMALL: z.string().min(1),
    DATABASE_URL: z.string(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  runtimeEnv: process.env,
});
